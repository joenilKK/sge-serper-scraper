// SERP Scraper - Works in both Apify and standalone Node.js
import { providerFactory } from './providers/provider-factory.js';
import fs from 'fs';
import path from 'path';

// Dynamic import for Apify SDK (only when running on Apify)
let Actor = null;
try {
    const apifyModule = await import('apify');
    Actor = apifyModule.Actor;
} catch (error) {
    // Apify SDK not available - running locally
    console.log('Running in local mode (Apify SDK not found)');
}

// Get input from Apify, command line arguments, or config file
const input = await getInput();

// Validate input
if (!input) {
    throw new Error('No input provided. Please provide search queries.');
}

// Get configuration from environment variables
const mode = input.mode || 'search';
const providerName = input.provider || 'serper';
const providerKey = input.providerKey || process.env.PROVIDER_KEY;

if (!providerKey) {
    throw new Error('Provider key is required. Please set PROVIDER_KEY environment variable or provide providerKey in input.');
}

// Create provider instance based on mode
const provider = providerFactory.createProviderByMode(mode, providerName, {
    apiKey: providerKey
});

console.log(`Using provider: ${provider.getName()} (${mode} mode)`);

// Create output directory for storing results
const outputDir = input.outputDir || './output';
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

// Process queries (support both single query and bulk queries)
const queries = input.queries || (input.query ? [input.query] : []);
const maxResults = input.maxResults ?? 500;
const searchOptions = {
    location: input.location || 'Singapore',
    language: input.language || 'en',
    maxResults: maxResults,
    ll: input.ll // Location coordinates for maps
};

// Handle unlimited results (0 means unlimited)
const isUnlimited = maxResults === 0;

console.log(`Processing ${queries.length} query(ies): ${queries.join(', ')}`);

// Process each query
for (const query of queries) {
    console.log(`\nProcessing query: "${query}"`);
    
    try {
        let totalResults = 0;
        let pageCount = 0;
        
        // Build list of domains to track (support both single and multiple domains)
        const domainsToTrack = [];
        if (input.domain) {
            domainsToTrack.push(input.domain);
        }
        if (input.domains && Array.isArray(input.domains)) {
            domainsToTrack.push(...input.domains);
        }
        
        // Track which domains have been found
        const domainMatches = new Map(); // domain -> match data or null
        domainsToTrack.forEach(domain => domainMatches.set(normalizeDomain(domain), null));

        // Get paginated results
        for await (const result of provider.getPaginatedResults(query, searchOptions)) {
            pageCount++;
            totalResults += result.items.length;
            
            if (isUnlimited) {
                console.log(`  Page ${result.page}: ${result.items.length} results (Total: ${totalResults})`);
            } else {
                console.log(`  Page ${result.page}: ${result.items.length} results (Total: ${totalResults}/${maxResults})`);
            }
            
            // If domain filtering is enabled, check for matches
            if (domainsToTrack.length > 0) {
                // Check each domain that hasn't been found yet
                for (const [normalizedDomain, currentMatch] of domainMatches.entries()) {
                    if (currentMatch === null) {
                        // Find original domain string for this normalized domain
                        const originalDomain = domainsToTrack.find(d => normalizeDomain(d) === normalizedDomain);
                        const match = findFirstDomainMatch(result.items, originalDomain);
                        if (match) {
                            domainMatches.set(normalizedDomain, { domain: originalDomain, match });
                            console.log(`  ✓ Domain match found for "${originalDomain}" on page ${result.page} at position ${match.position}`);
                        }
                    }
                }
                
                // Check if all domains have been found
                const allFound = Array.from(domainMatches.values()).every(match => match !== null);
                if (allFound) {
                    console.log(`  ✓ All domains found. Stopping this query.`);
                    break;
                }
            } else {
                // No domain filtering: store results per page
                await saveResultsToFile(result.items, query, result.page, outputDir);
            }
            
            // Check if we've reached the max results limit (skip if unlimited)
            if (!isUnlimited && totalResults >= maxResults) {
                console.log(`  ✓ Reached max results limit (${maxResults}) for query "${query}"`);
                break;
            }
            
            // Add small delay between pages to be respectful
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        // Save results for each tracked domain
        if (domainsToTrack.length > 0) {
            for (const [normalizedDomain, matchData] of domainMatches.entries()) {
                const originalDomain = domainsToTrack.find(d => normalizeDomain(d) === normalizedDomain);
                
                if (matchData && matchData.match) {
                    // Domain was found
                    const savedData = await saveDomainMatchSummary(query, originalDomain, matchData.match, outputDir);
                    // Push to Apify dataset if available
                    if (Actor) {
                        await Actor.pushData(savedData);
                    }
                } else {
                    // Domain was not found
                    const savedData = await saveDomainNoMatchSummary(query, originalDomain, outputDir);
                    // Push to Apify dataset if available
                    if (Actor) {
                        await Actor.pushData(savedData);
                    }
                    console.log(`  ✗ No results matched domain "${originalDomain}"`);
                }
            }
        } else {
            console.log(`✓ Completed query "${query}": ${totalResults} total results across ${pageCount} pages`);
        }
        
    } catch (error) {
        console.error(`✗ Error processing query "${query}":`, error.message);
        
        // Store error result
        await saveResultsToFile([{
            title: '',
            snippet: '',
            link: '',
            position: 0,
            query: query,
            page: 0,
            error: error.message
        }], query, 0, outputDir);
    }
}

console.log('\n🎉 All queries processed successfully!');
// console.log(`Results saved to: ${outputDir}`);

// Exit Apify actor if running on Apify
if (Actor) {
    await Actor.exit();
}

// Helper functions
async function getInput() {
    // First, check if running on Apify
    if (Actor) {
        await Actor.init();
        const apifyInput = await Actor.getInput();
        if (apifyInput) {
            console.log('Using Apify input');
            return apifyInput;
        }
    }
    
    // Try to get input from command line arguments
    const args = process.argv.slice(2);
    
    if (args.length > 0) {
        // Simple command line input parsing
        const input = {
            queries: [],
            domains: [],
            provider: 'serper',
            mode: 'search',
            maxResults: 500,
            location: 'Singapore',
            language: 'en'
        };
        
        for (let i = 0; i < args.length; i++) {
            switch (args[i]) {
                case '--query':
                case '-q':
                    input.queries.push(args[++i]);
                    break;
                case '--domain':
                    input.domain = args[++i];
                    break;
                case '--domains':
                    // Support comma-separated domains
                    const domainList = args[++i].split(',').map(d => d.trim());
                    input.domains.push(...domainList);
                    break;
                case '--provider':
                case '-p':
                    input.provider = args[++i];
                    break;
                case '--mode':
                case '-m':
                    input.mode = args[++i];
                    break;
                case '--max-results':
                case '-r':
                    input.maxResults = parseInt(args[++i]);
                    break;
                case '--location':
                case '-l':
                    input.location = args[++i];
                    break;
                case '--language':
                    input.language = args[++i];
                    break;
                case '--output':
                case '-o':
                    input.outputDir = args[++i];
                    break;
                case '--provider-key':
                case '-k':
                    input.providerKey = args[++i];
                    break;
            }
        }
        
        return input;
    }
    
    // Try to load from config file
    const configPath = './config.json';
    if (fs.existsSync(configPath)) {
        try {
            const configData = fs.readFileSync(configPath, 'utf8');
            return JSON.parse(configData);
        } catch (error) {
            console.error('Error reading config file:', error.message);
        }
    }
    
    // Return default config if no input found
    return {
        queries: ['example search query'],
        provider: 'serper',
        mode: 'search',
        maxResults: 500,
        location: 'Singapore',
        language: 'en',
        outputDir: './output'
    };
}

async function saveResultsToFile(items, query, page, outputDir) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${query.replace(/[^a-zA-Z0-9]/g, '_')}_page_${page}_${timestamp}.json`;
    const filepath = path.join(outputDir, filename);
    
    const data = {
        query: query,
        page: page,
        timestamp: new Date().toISOString(),
        items: items
    };
    
    // Save to file system
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
    console.log(`  📁 Saved ${items.length} results to: ${filename}`);
    
    // Push each item to Apify dataset if available
    if (Actor) {
        for (const item of items) {
            await Actor.pushData({
                query: query,
                page: page,
                timestamp: data.timestamp,
                ...item
            });
        }
    }
}

async function saveDomainNoMatchSummary(query, domain, outputDir) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeQuery = query.replace(/[^a-zA-Z0-9]/g, '_');
    const safeDomain = normalizeDomain(domain).replace(/[^a-zA-Z0-9.-]/g, '_');
    const filename = `${safeQuery}_match_${safeDomain}_${timestamp}.json`;
    const filepath = path.join(outputDir, filename);
    const data = {
        keyword: query,
        domain: normalizeDomain(domain),
        link: null,
        title: null,
        rank: null,
        timestamp: new Date().toISOString()
    };
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
    console.log(`  🔎 Saved domain not-found summary: ${filename}`);
    return data;
}

function extractHostname(url) {
    try {
        const { hostname } = new URL(url);
        return hostname.replace(/^www\./i, '').toLowerCase();
    } catch {
        return '';
    }
}

function normalizeDomain(domain) {
    if (!domain) return '';
    try {
        // Allow full URLs or bare domains
        const parsed = domain.includes('://') ? new URL(domain) : new URL(`https://${domain}`);
        return parsed.hostname.replace(/^www\./i, '').toLowerCase();
    } catch {
        return domain.replace(/^www\./i, '').toLowerCase();
    }
}

function findFirstDomainMatch(items, domain) {
    const target = normalizeDomain(domain);
    if (!target) return null;
    for (const item of items) {
        const host = extractHostname(item.link || '');
        if (host === target || host.endsWith(`.${target}`)) {
            return {
                link: item.link || '',
                title: item.title || '',
                position: item.position || 0
            };
        }
    }
    return null;
}

async function saveDomainMatchSummary(query, domain, match, outputDir) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeQuery = query.replace(/[^a-zA-Z0-9]/g, '_');
    const safeDomain = normalizeDomain(domain).replace(/[^a-zA-Z0-9.-]/g, '_');
    const filename = `${safeQuery}_match_${safeDomain}_${timestamp}.json`;
    const filepath = path.join(outputDir, filename);
    const data = {
        keyword: query,
        domain: normalizeDomain(domain),
        link: match.link,
        title: match.title,
        rank: match.position,
        timestamp: new Date().toISOString()
    };
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
    console.log(`  🔎 Saved domain match summary: ${filename}`);
    return data;
}
