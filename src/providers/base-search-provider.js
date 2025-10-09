import { BaseProvider } from './base-provider.js';

/**
 * Base provider for search results
 * Extends BaseProvider with search-specific functionality
 */
export class BaseSearchProvider extends BaseProvider {
    constructor(config) {
        super(config);
    }

    /**
     * Get provider mode
     * @returns {string} - Provider mode
     */
    getMode() {
        return 'search';
    }

    /**
     * Normalize search results to standard format
     * @param {Object} data - Raw provider response
     * @param {string} query - Original query
     * @param {number} page - Page number
     * @returns {Object} - Normalized search results
     */
    normalizeResults(data, query, page) {
        throw new Error('normalizeResults() method must be implemented by search provider');
    }

    /**
     * Create error result for failed search queries
     * @param {string} query - Query that failed
     * @param {number} page - Page number
     * @param {string} error - Error message
     * @returns {Object} - Error result
     */
    createErrorResult(query, page, error) {
        return {
            items: [{
                title: '',
                snippet: '',
                link: '',
                position: (page * 10) + 1,
                query: query,
                page: page + 1,
                error: error
            }],
            query,
            page: page + 1,
            totalResults: 0,
            hasMorePages: false,
            provider: this.getName(),
            mode: this.getMode(),
            timestamp: new Date().toISOString(),
            error: error
        };
    }
}
