import { BaseMapsProvider } from './base-maps-provider.js';

/**
 * Serper.dev maps provider implementation
 */
export class SerperMapsProvider extends BaseMapsProvider {
    constructor(config) {
        super(config);
        this.apiKey = config.apiKey;
        this.baseUrl = 'https://google.serper.dev/maps';
        this.maxRetries = 3;
        this.retryDelay = 1000; // 1 second
    }

    getName() {
        return 'Serper.dev (Maps)';
    }

    /**
     * Convert location name to country code for Serper API
     * @param {string} location - Location name or code
     * @returns {string} - Country code
     */
    normalizeLocation(location) {
        if (!location) return undefined;
        
        // Common location mappings
        const locationMap = {
            'singapore': 'sg',
            'united states': 'us',
            'usa': 'us',
            'united kingdom': 'gb',
            'uk': 'gb',
            'australia': 'au',
            'canada': 'ca',
            'india': 'in',
            'malaysia': 'my',
            'indonesia': 'id',
            'philippines': 'ph',
            'thailand': 'th',
            'vietnam': 'vn',
            'hong kong': 'hk',
            'japan': 'jp',
            'south korea': 'kr',
            'china': 'cn'
        };
        
        const normalized = location.toLowerCase().trim();
        
        // Return mapped value or assume it's already a country code
        return locationMap[normalized] || (location.length === 2 ? location.toLowerCase() : location);
    }

    /**
     * Perform a maps search query with retry logic
     * @param {string} query - Search query
     * @param {Object} options - Search options
     * @returns {Promise<Object>} - Normalized maps results
     */
    async search(query, options = {}) {
        const { page = 0, location, language, ll } = options;
        
        const requestBody = {
            q: query,
            page: page + 1 // Serper.dev uses 1-based page numbering
        };

        // Add location (gl) if provided - convert to country code
        if (location) {
            requestBody.gl = this.normalizeLocation(location);
        }

        // Add language (hl) if provided
        if (language) {
            requestBody.hl = language;
        }

        // Add location coordinates if provided
        if (ll) {
            requestBody.ll = ll;
        }

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
                console.warn(`Attempt ${attempt}/${this.maxRetries} failed for maps query "${query}", page ${page}:`, error.message);
                
                if (attempt < this.maxRetries) {
                    await this.delay(this.retryDelay * attempt); // Exponential backoff
                }
            }
        }

        // All retries failed
        throw new Error(`Failed to fetch maps results for query "${query}", page ${page} after ${this.maxRetries} attempts. Last error: ${lastError.message}`);
    }

    /**
     * Normalize Serper.dev maps response to standard format
     * @param {Object} data - Raw Serper.dev maps response
     * @param {string} query - Original query
     * @param {number} page - Page number
     * @returns {Object} - Normalized maps results
     */
    normalizeResults(data, query, page) {
        const items = (data.places || []).map((item, index) => ({
            position: (page * 10) + index + 1, // Maps also returns 10 per page
            title: item.title || '',
            address: item.address || '',
            latitude: item.latitude || '',
            longitude: item.longitude || '',
            rating: item.rating || '',
            ratingCount: item.ratingCount || '',
            type: item.type || '',
            types: item.types || [],
            website: item.website || '',
            phoneNumber: item.phoneNumber || '',
            openingHours: item.openingHours || {},
            thumbnailUrl: item.thumbnailUrl || '',
            cid: item.cid || '',
            fid: item.fid || '',
            placeId: item.placeId || '',
            query: query,
            page: page + 1,
            error: null
        }));

        return {
            items,
            query,
            page: page + 1,
            totalResults: 0, // Maps API doesn't provide total results
            hasMorePages: items.length > 0, // Continue if we got any results
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

                // Check if there are more pages (continue if we got results)
                hasMoreResults = results.items.length > 0;
                page++;
            } catch (error) {
                console.log(`Reached end of pages for query "${query}" at page ${page} (API error: ${error.message})`);
                hasMoreResults = false;
                break;
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
