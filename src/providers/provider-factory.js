import { SerperSearchProvider } from './serper-provider.js';
import { SerperMapsProvider } from './serper-maps-provider.js';

/**
 * Provider factory for creating SERP providers
 */
export class ProviderFactory {
    constructor() {
        this.providers = new Map();
        this.registerDefaultProviders();
    }

    /**
     * Register default providers
     */
    registerDefaultProviders() {
        this.registerProvider('serper-search', SerperSearchProvider);
        this.registerProvider('serper-maps', SerperMapsProvider);
    }

    /**
     * Register a new provider
     * @param {string} name - Provider name
     * @param {Class} ProviderClass - Provider class
     */
    registerProvider(name, ProviderClass) {
        this.providers.set(name, ProviderClass);
    }

    /**
     * Create a provider instance
     * @param {string} providerName - Name of the provider
     * @param {Object} config - Provider configuration
     * @returns {BaseProvider} - Provider instance
     */
    createProvider(providerName, config) {
        const ProviderClass = this.providers.get(providerName);
        
        if (!ProviderClass) {
            throw new Error(`Provider "${providerName}" not found. Available providers: ${Array.from(this.providers.keys()).join(', ')}`);
        }

        return new ProviderClass(config);
    }

    /**
     * Create a provider instance based on mode and provider
     * @param {string} mode - Mode (search or maps)
     * @param {string} provider - Provider name
     * @param {Object} config - Provider configuration
     * @returns {BaseProvider} - Provider instance
     */
    createProviderByMode(mode, provider, config) {
        const providerKey = `${provider}-${mode}`;
        return this.createProvider(providerKey, config);
    }

    /**
     * Get list of available providers
     * @returns {Array<string>} - List of provider names
     */
    getAvailableProviders() {
        return Array.from(this.providers.keys());
    }

    /**
     * Get provider display names for UI
     * @returns {Array<Object>} - List of provider info objects
     */
    getProviderOptions() {
        return [
            {
                value: 'serper',
                label: 'Serper.dev',
                description: 'Google Search and Maps API via Serper.dev'
            }
        ];
    }

    /**
     * Get mode options for UI
     * @returns {Array<Object>} - List of mode options
     */
    getModeOptions() {
        return [
            {
                value: 'search',
                label: 'Search',
                description: 'Regular Google search results'
            },
            {
                value: 'maps',
                label: 'Maps',
                description: 'Google Maps business listings'
            }
        ];
    }
}

// Export singleton instance
export const providerFactory = new ProviderFactory();
