import { BaseProvider } from './base-provider.js';

/**
 * Base provider for maps results
 * Extends BaseProvider with maps-specific functionality
 */
export class BaseMapsProvider extends BaseProvider {
    constructor(config) {
        super(config);
    }

    /**
     * Get provider mode
     * @returns {string} - Provider mode
     */
    getMode() {
        return 'maps';
    }

    /**
     * Normalize maps results to standard format
     * @param {Object} data - Raw provider response
     * @param {string} query - Original query
     * @param {number} page - Page number
     * @returns {Object} - Normalized maps results
     */
    normalizeResults(data, query, page) {
        throw new Error('normalizeResults() method must be implemented by maps provider');
    }

    /**
     * Create error result for failed maps queries
     * @param {string} query - Query that failed
     * @param {number} page - Page number
     * @param {string} error - Error message
     * @returns {Object} - Error result
     */
    createErrorResult(query, page, error) {
        return {
            items: [{
                position: '',
                title: '',
                address: '',
                latitude: '',
                longitude: '',
                rating: '',
                ratingCount: '',
                type: '',
                types: [],
                website: '',
                phoneNumber: '',
                openingHours: {},
                thumbnailUrl: '',
                cid: '',
                fid: '',
                placeId: '',
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
