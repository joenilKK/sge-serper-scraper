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

// Initialize actor state persistence
let actorState = {
    processedQueries: [],
    currentQueryIndex: 0,
    totalResults: 0,
    startTime: new Date().toISOString(),
    migrationCount: 0,
    lastMigration: null
};

// Load previous state if available (when running on Apify)
if (Actor) {
    const previousState = await Actor.getValue('ACTOR_STATE');
    if (previousState) {
        actorState = { ...actorState, ...previousState };
    }
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
    apiKey: providerKey,
    noResultsRetries: input.noResultsRetries,
    noResultsRetryDelay: input.noResultsRetryDelay
});


// Create output directory for storing results
const outputDir = input.outputDir || './output';
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

// Process queries
const queries = input.queries || [];

// Validate queries
if (!queries || queries.length === 0) {
    throw new Error('No queries provided. Please add at least one search query.');
}

// Validate domain format if provided
if (input.domain) {
    const domainPattern = /^(?:www\.)?[a-zA-Z0-9][-a-zA-Z0-9]*(?:\.[a-zA-Z0-9][-a-zA-Z0-9]*)*$/;
    if (!domainPattern.test(input.domain)) {
        throw new Error('Invalid domain format. Use formats like: lkyurology.com, www.lkyurology.com, or lkyurology (no http://, https://, or paths)');
    }
}

const maxResults = input.maxResults ?? 500;
const searchOptions = {
    location: input.location || 'Singapore',
    language: input.language || 'en',
    maxResults: maxResults
};

// Handle unlimited results (0 means unlimited)
const isUnlimited = maxResults === 0;


// Set up actor persistence event listeners
if (Actor) {
    // Listen for migration events to save state
    Actor.on('migrating', async (data) => {
        actorState.migrationCount++;
        actorState.lastMigration = new Date().toISOString();
        await Actor.setValue('ACTOR_STATE', actorState);
    });

    // Listen for periodic state persistence
    Actor.on('persistState', async (data) => {
        await Actor.setValue('ACTOR_STATE', actorState);
    });

    // Listen for abort events
    Actor.on('aborting', async () => {
        await Actor.setValue('ACTOR_STATE', actorState);
    });

    // Listen for CPU info events
    Actor.on('cpuInfo', (data) => {
        // CPU monitoring handled silently
    });

}


// Process each query
for (let queryIndex = actorState.currentQueryIndex; queryIndex < queries.length; queryIndex++) {
    const query = queries[queryIndex];
    
    // Update current query index in state
    actorState.currentQueryIndex = queryIndex;
    
    try {
        let totalResults = 0;
        let pageCount = 0;
        
        // Track domain match state per query
        let domainFound = false;

        // Get paginated results
        for await (const result of provider.getPaginatedResults(query, searchOptions)) {
            pageCount++;
            totalResults += result.items.length;
            
            
            
            // If domain filtering is enabled, try to find the first occurrence and early-stop.
            // When domain is specified, skip saving per-page files to keep exactly one JSON per query.
            if (input.domain) {
                const targetDomain = normalizeDomain(input.domain);
                const match = findFirstDomainMatch(result.items, input.domain);
                if (match) {
                    // Check if we've reached or exceeded max results
                    const hasReachedMaxResults = !isUnlimited && totalResults >= maxResults;
                    const matchData = await saveDomainMatchSummary(query, input.domain, match, outputDir, hasReachedMaxResults, maxResults);
                    // Push to Apify dataset if available
                    if (Actor) {
                        await Actor.pushData(matchData);
                    }
                    domainFound = true;
                    break;
                }
            } else {
                // No domain filtering: store results per page
                await saveResultsToFile(result.items, query, result.page, outputDir);
            }
            
            // Check if we've reached the max results limit (skip if unlimited)
            if (!isUnlimited && totalResults >= maxResults) {
                break;
            }
            
            // Add small delay between pages to be respectful
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        // If domain mode was enabled and no match found across all pages, save a single not-found summary
        if (input.domain) {
            if (!domainFound) {
                // If we got results but domain wasn't found, or if we got no results at all
                // In both cases, mark as ">maxResults" since domain wasn't found in the checked range
                const reachedMaxResults = !isUnlimited && (totalResults >= maxResults || totalResults === 0);
                const noMatchData = await saveDomainNoMatchSummary(query, input.domain, outputDir, reachedMaxResults, maxResults);
                // Push to Apify dataset if available
                if (Actor) {
                    await Actor.pushData(noMatchData);
                }
            }
        } else {
        }
        
        // Update actor state with completed query
        actorState.processedQueries.push({
            query: query,
            totalResults: totalResults,
            pageCount: pageCount,
            completedAt: new Date().toISOString()
        });
        actorState.totalResults += totalResults;
        
        // Save state after each query completion
        if (Actor) {
            await Actor.setValue('ACTOR_STATE', actorState);
        }
        
        
    } catch (error) {
        console.error(`Error processing query "${query}":`, error.message);
        
        // If domain filtering is enabled, save a not-found summary with >maxResults
        if (input.domain) {
            const noMatchData = await saveDomainNoMatchSummary(query, input.domain, outputDir, true, maxResults);
            if (Actor) {
                await Actor.pushData(noMatchData);
            }
        } else {
            // Store error result for non-domain queries
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
        
        // Update actor state with error
        actorState.processedQueries.push({
            query: query,
            error: error.message,
            failedAt: new Date().toISOString()
        });
        
        // Save state after error
        if (Actor) {
            await Actor.setValue('ACTOR_STATE', actorState);
        }
    }
}


// Clear actor state on successful completion
if (Actor) {
    await Actor.setValue('ACTOR_STATE', null);
    await Actor.exit();
}

// Helper functions
async function getInput() {
    // First, check if running on Apify
    if (Actor) {
        await Actor.init();
        const apifyInput = await Actor.getInput();
        if (apifyInput) {
            return apifyInput;
        }
    }
    
    // Try to get input from command line arguments
    const args = process.argv.slice(2);
    
    if (args.length > 0) {
        // Simple command line input parsing
        const input = {
            queries: [],
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
                case '--debug-migration':
                    input.debugMigration = args[++i] === 'true';
                    break;
                case '--test-migration-after-seconds':
                    input.testMigrationAfterSeconds = parseInt(args[++i]);
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
        queries: [],
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

async function saveDomainNoMatchSummary(query, domain, outputDir, reachedMaxResults = false, maxResults = 100) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeQuery = query.replace(/[^a-zA-Z0-9]/g, '_');
    const safeDomain = normalizeDomain(domain).replace(/[^a-zA-Z0-9.-]/g, '_');
    const filename = `${safeQuery}_match_${safeDomain}_${timestamp}.json`;
    const filepath = path.join(outputDir, filename);
    
    // If we reached max results without finding the domain, show ">maxResults" instead of null
    const rankValue = reachedMaxResults ? `>${maxResults}` : null;
    
    const data = {
        keyword: query,
        domain: domain,
        link: null,
        title: null,
        rank: rankValue,
        timestamp: new Date().toISOString()
    };
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
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
        // Input validation ensures clean domains (no http://, https://, or paths)
        // But handle URLs for backward compatibility
        const parsed = domain.includes('://') ? new URL(domain) : new URL(`https://${domain}`);
        return parsed.hostname.replace(/^www\./i, '').toLowerCase();
    } catch {
        // Fallback: just remove www. and lowercase
        return domain.replace(/^www\./i, '').toLowerCase();
    }
}

function findFirstDomainMatch(items, domain) {
    const target = normalizeDomain(domain);
    if (!target) return null;
    for (const item of items) {
        const host = extractHostname(item.link || '');
        
        // Check for exact match
        const exactMatch = host === target;
        
        // Check for subdomain match (e.g., sub.example.com matches example.com)
        const subdomainMatch = host.endsWith(`.${target}`);
        
        // Check for partial word match (e.g., lkyurology matches lkyurology.com)
        // Split both host and target by dots and check if target words are contained in host
        const hostParts = host.split('.');
        const targetParts = target.split('.');
        const partialMatch = targetParts.every(targetPart => 
            hostParts.some(hostPart => hostPart.includes(targetPart))
        );
        
        if (exactMatch || subdomainMatch || partialMatch) {
            let matchType = exactMatch ? 'exact' : (subdomainMatch ? 'subdomain' : 'partial');
            return {
                link: item.link || '',
                title: item.title || '',
                position: item.position || 0
            };
        }
    }
    return null;
}

async function saveDomainMatchSummary(query, domain, match, outputDir, hasReachedMaxResults = false, maxResults = 100) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeQuery = query.replace(/[^a-zA-Z0-9]/g, '_');
    const safeDomain = normalizeDomain(domain).replace(/[^a-zA-Z0-9.-]/g, '_');
    const filename = `${safeQuery}_match_${safeDomain}_${timestamp}.json`;
    const filepath = path.join(outputDir, filename);
    
    // Format rank as ">maxResults" if we've reached the max results limit
    const formattedRank = hasReachedMaxResults ? '>100' : match.position;
    
    const data = {
        keyword: query,
        domain: domain,
        link: match.link,
        title: match.title,
        rank: formattedRank,
        timestamp: new Date().toISOString()
    };
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
    return data;
}

