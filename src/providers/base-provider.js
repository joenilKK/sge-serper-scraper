/**
 * Base provider interface for SERP providers
 * All providers must implement these methods
 */
export class BaseProvider {
    constructor(config) {
        this.config = config;
    }

    /**
     * Perform a search query
     * @param {string} query - Search query
     * @param {Object} options - Search options (page, location, etc.)
     * @returns {Promise<Object>} - Normalized search results
     */
    async search(query, options = {}) {
        throw new Error('search() method must be implemented by provider');
    }

    /**
     * Get paginated results for a query
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
                hasMoreResults = false;
                throw error;
            }
        }
    }

    /**
     * Validate input parameters
     * @param {Object} input - Input parameters
     * @returns {Object} - Validated input
     */
    validateInput(input) {
        if (!input.query && !input.queries) {
            throw new Error('Either "query" or "queries" must be provided');
        }
        return input;
    }

    /**
     * Get provider name
     * @returns {string} - Provider name
     */
    getName() {
        throw new Error('getName() method must be implemented by provider');
    }

    /**
     * Get provider mode (search or maps)
     * @returns {string} - Provider mode
     */
    getMode() {
        throw new Error('getMode() method must be implemented by provider');
    }

    /**
     * Get rate limit information
     * @returns {Object} - Rate limit info
     */
    getRateLimitInfo() {
        return {
            requestsPerMinute: null,
            requestsPerDay: null,
            remainingRequests: null
        };
    }
}
