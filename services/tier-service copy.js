const fs = require('fs').promises;
const path = require('path');
require("dotenv").config();

class TierService {
    constructor() {
        this.metadataDir = path.join(__dirname, '..', 'metadata');
        this.cacheFile = path.join(__dirname, '..', 'data', 'tier-cache.json');
        this.tierCache = {
            common: [],
            rare: [],
            legendary: [],
            rare_1of1: [],
            legendary_1of1: []
        };
        
        this.tierLimits = {
            common: 4447,
            rare: 10,
            legendary: 2,
            rare_1of1: 10,
            legendary_1of1: 2
        };

        // Generate tiers immediately
        this.generateTiers();
        console.log('✅ TierService initialized with generated tiers');
    }

    /**
     * Generate tier distribution deterministically
     */
    generateTiers() {
        console.log('🎲 Generating tier distribution...');
        
        // Reset cache
        this.tierCache = {
            common: [],
            rare: [],
            legendary: [],
            rare_1of1: [],
            legendary_1of1: []
        };

        const totalTokens = 5000;
        
        for (let tokenId = 1; tokenId <= totalTokens; tokenId++) {
            const tier = this.getTierByTokenId(tokenId);
            this.tierCache[tier].push(tokenId);
        }

        this.printRaritySummary();
        this.saveTierCache().catch(console.error);
    }

    /**
     * Deterministic tier distribution by token ID
     */
    getTierByTokenId(tokenId) {
        // First 2 tokens: legendary 1-of-1
        if (tokenId <= 2) return 'legendary_1of1';
        
        // Next 10 tokens: rare 1-of-1 (tokens 3-12)
        if (tokenId <= 12) return 'rare_1of1';
        
        // Next 738 tokens: legendary (tokens 13-750)
        if (tokenId <= 750) return 'legendary';
        
        // Next 1,750 tokens: rare (tokens 751-2500)
        if (tokenId <= 2500) return 'rare';
        
        // Remaining 2,500 tokens: common (tokens 2501-5000)
        return 'common';
    }

    /**
     * Load tier cache from file
     */
    async loadTierCache() {
        try {
            const data = await fs.readFile(this.cacheFile, 'utf8');
            this.tierCache = JSON.parse(data);
            console.log(`✅ Loaded tier cache: ${this.getTotalCached()} tokens`);
        } catch (error) {
            console.log('ℹ️  No tier cache found, generating fresh tiers');
            this.generateTiers();
        }
    }

    /**
     * Save tier cache to file
     */
    async saveTierCache() {
        try {
            const dataDir = path.join(__dirname, '..', 'data');
            await fs.mkdir(dataDir, { recursive: true });
            
            await fs.writeFile(this.cacheFile, JSON.stringify(this.tierCache, null, 2));
            console.log(`💾 Saved tier cache: ${this.getTotalCached()} tokens`);
        } catch (error) {
            console.error('❌ Error saving tier cache:', error.message);
        }
    }

    /**
     * Get total number of cached tokens
     */
    getTotalCached() {
        return Object.values(this.tierCache).reduce((sum, arr) => sum + arr.length, 0);
    }

    /**
     * Get tier for a token (uses cache)
     */
    async getTierForToken(tokenId) {
        // Check cache first
        for (const [tier, tokens] of Object.entries(this.tierCache)) {
            if (tokens.includes(tokenId)) {
                return tier;
            }
        }

        // If not in cache, use deterministic distribution
        const tier = this.getTierByTokenId(tokenId);
        this.tierCache[tier].push(tokenId);
        await this.saveTierCache();
        return tier;
    }

    /**
     * Get all token IDs for a specific tier
     */
    getTokensByTier(tier) {
        if (!this.tierCache[tier]) {
            console.warn(`⚠️  Tier "${tier}" not found in cache`);
            return [];
        }
        return this.tierCache[tier];
    }

    /**
     * Get tier statistics
     */
    getTierStats() {
        return {
            common: {
                count: this.tierCache.common ? this.tierCache.common.length : 0,
                limit: this.tierLimits.common
            },
            rare: {
                count: this.tierCache.rare ? this.tierCache.rare.length : 0,
                limit: this.tierLimits.rare
            },
            legendary: {
                count: this.tierCache.legendary ? this.tierCache.legendary.length : 0,
                limit: this.tierLimits.legendary
            },
            rare_1of1: {
                count: this.tierCache.rare_1of1 ? this.tierCache.rare_1of1.length : 0,
                limit: this.tierLimits.rare_1of1
            },
            legendary_1of1: {
                count: this.tierCache.legendary_1of1 ? this.tierCache.legendary_1of1.length : 0,
                limit: this.tierLimits.legendary_1of1
            }
        };
    }

    /**
     * Print rarity summary
     */
    printRaritySummary() {
        const stats = this.getTierStats();
        const total = Object.values(stats).reduce((sum, stat) => sum + stat.count, 0);
        
        console.log('\n🎲 Rarity Distribution:');
        console.log('═══════════════════════════════════════');
        console.log(`Common:     ${stats.common.count} NFTs (${((stats.common.count / total) * 100).toFixed(1)}%)`);
        console.log(`Rare:       ${stats.rare.count} NFTs (${((stats.rare.count / total) * 100).toFixed(1)}%)`);
        console.log(`Legendary:  ${stats.legendary.count} NFTs (${((stats.legendary.count / total) * 100).toFixed(1)}%)`);
        console.log(`Rare 1-of-1: ${stats.rare_1of1.count} NFTs`);
        console.log(`Legendary 1-of-1: ${stats.legendary_1of1.count} NFTs`);
        console.log('═══════════════════════════════════════');
        console.log(`Total: ${total} NFTs\n`);
    }

    /**
     * Rebuild tiers from metadata (admin function)
     */
    async rebuildTiersFromMetadata() {
        console.log('🔄 Rebuilding tiers using deterministic distribution...');
        this.generateTiers();
        return this.getTierStats();
    }

    /**
     * Get available tokens for a tier (not minted)
     */
    getAvailableTokensByTier(tier, mintedTokens) {
        const allTokens = this.getTokensByTier(tier);
        return allTokens.filter(tokenId => !mintedTokens.has(tokenId));
    }
}

module.exports = TierService;