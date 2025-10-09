import { BaseSearchProvider } from './base-search-provider.js';

/**
 * Serper.dev search provider implementation
 */
export class SerperSearchProvider extends BaseSearchProvider {
    constructor(config) {
        super(config);
        this.apiKey = config.apiKey;
        this.baseUrl = 'https://google.serper.dev/search';
        this.maxRetries = 3;
        this.retryDelay = 1000; // 1 second
    }

    getName() {
        return 'Serper.dev (Search)';
    }

    /**
     * Perform a search query with retry logic
     * @param {string} query - Search query
     * @param {Object} options - Search options
     * @returns {Promise<Object>} - Normalized search results
     */
    async search(query, options = {}) {
        const { page = 0, location = 'United States', language = 'en' } = options;
        
        const requestBody = {
            q: query,
            page: page + 1, // Serper.dev uses 1-based page numbering
            gl: location,
            hl: language
        };

        let lastError;
        
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                const response = await fetch(this.baseUrl, {
                    method: 'POST',
                    headers: {
                        'X-API-KEY': this.apiKey,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(requestBody)
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`HTTP ${response.status}: ${errorText}`);
                }

                const data = await response.json();
                return this.normalizeResults(data, query, page);

            } catch (error) {
                lastError = error;
                console.warn(`Attempt ${attempt}/${this.maxRetries} failed for query "${query}", page ${page}:`, error.message);
                
                if (attempt < this.maxRetries) {
                    await this.delay(this.retryDelay * attempt); // Exponential backoff
                }
            }
        }

        // All retries failed
        throw new Error(`Failed to fetch results for query "${query}", page ${page} after ${this.maxRetries} attempts. Last error: ${lastError.message}`);
    }

    /**
     * Normalize Serper.dev search response to standard format
     * @param {Object} data - Raw Serper.dev response
     * @param {string} query - Original query
     * @param {number} page - Page number
     * @returns {Object} - Normalized search results
     */
    normalizeResults(data, query, page) {
        const items = (data.organic || []).map((item, index) => ({
            title: item.title || '',
            snippet: item.snippet || '',
            link: item.link || '',
            position: (page * 10) + index + 1,
            query: query,
            page: page + 1,
            error: null
        }));

        return {
            items,
            query,
            page: page + 1,
            totalResults: data.searchInformation?.totalResults || 0,
            hasMorePages: items.length === 10, // Serper returns 10 per page
            provider: this.getName(),
            mode: this.getMode(),
            timestamp: new Date().toISOString()
        };
    }


    /**
     * Get paginated results with error handling
     * @param {string} query - Search query
     * @param {Object} options - Search options
     * @returns {AsyncGenerator<Object>} - Generator yielding normalized results
     */
    async* getPaginatedResults(query, options = {}) {
        let page = 0;
        let hasMoreResults = true;

        while (hasMoreResults) {
            try {
                const results = await this.search(query, { ...options, page });
                
                if (!results.items || results.items.length === 0) {
                    hasMoreResults = false;
                    break;
                }

                yield results;

                // Check if there are more pages
                hasMoreResults = results.hasMorePages || false;
                page++;
            } catch (error) {
                console.error(`Error fetching page ${page} for query "${query}":`, error);
                
                // Yield error result and continue
                yield this.createErrorResult(query, page, error.message);
                hasMoreResults = false;
            }
        }
    }

    /**
     * Delay execution
     * @param {number} ms - Milliseconds to delay
     * @returns {Promise} - Promise that resolves after delay
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get rate limit information from Serper.dev
     * @returns {Object} - Rate limit info
     */
    getRateLimitInfo() {
        // Serper.dev typically allows 100 requests per month for free tier
        // This would need to be updated based on actual API response headers
        return {
            requestsPerMinute: 60,
            requestsPerDay: 1000,
            remainingRequests: null // Would need to parse from response headers
        };
    }
}
