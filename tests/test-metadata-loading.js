const MintService = require('../services/mint-service');
require('dotenv').config();

async function testMetadataLoading() {
    console.log('🧪 Testing Metadata File Loading System\n');
    
    const mintService = new MintService();
    
    try {
        // Test 1: Check if metadata files exist
        console.log('📋 Test 1: Checking Metadata Files\n');
        
        const fs = require('fs').promises;
        const path = require('path');
        const metadataPath = path.join(__dirname, '..', 'metadata');
        
        try {
            const files = await fs.readdir(metadataPath);
            const jsonFiles = files.filter(f => f.endsWith('.json'));
            
            console.log(`✅ Metadata folder found`);
            console.log(`   Total JSON files: ${jsonFiles.length}`);
            console.log(`   First 10 files: ${jsonFiles.slice(0, 10).join(', ')}\n`);
            
            if (jsonFiles.length === 0) {
                console.log('❌ No metadata files found!');
                console.log('   Please add your 5000 JSON files to the metadata/ folder\n');
                return;
            }
        } catch (error) {
            console.log('❌ Metadata folder not found or empty');
            console.log(`   Error: ${error.message}\n`);
            return;
        }
        
        // Test 2: Load a specific metadata file
        console.log('📄 Test 2: Loading Specific Metadata File\n');
        
        try {
            const metadata1 = await mintService.loadMetadata(1);
            console.log(`✅ Successfully loaded metadata for token #1`);
            console.log(`   Name: ${metadata1.name}`);
            console.log(`   Image: ${metadata1.image}`);
            console.log(`   Edition: ${metadata1.edition}`);
            console.log(`   Attributes: ${metadata1.attributes.length}\n`);
        } catch (error) {
            console.log(`❌ Failed to load metadata #1: ${error.message}\n`);
        }
        
        // Test 3: Check tier assignments
        console.log('🎯 Test 3: Checking Tier Assignments\n');
        
        const tier1 = mintService.tierService.getTierForToken(1);
        const tier42 = mintService.tierService.getTierForToken(42);
        const tier5000 = mintService.tierService.getTierForToken(5000);
        
        console.log(`   Token #1 tier: ${tier1}`);
        console.log(`   Token #42 tier: ${tier42}`);
        console.log(`   Token #5000 tier: ${tier5000}\n`);
        
        // Test 4: Get tier statistics
        console.log('📊 Test 4: Tier Statistics\n');
        
        const tierStats = mintService.tierService.getTierStats();
        
        console.log(`Common: ${tierStats.common.count.toLocaleString()} NFTs`);
        console.log(`Rare: ${tierStats.rare.count}/${tierStats.rare.limit} (${tierStats.rare.remaining} remaining)`);
        console.log(`Legendary: ${tierStats.legendary.count}/${tierStats.legendary.limit} (${tierStats.legendary.remaining} remaining)`);
        console.log(`Rare 1-of-1: ${tierStats.rare_1of1.count}/${tierStats.rare_1of1.limit} (${tierStats.rare_1of1.remaining} remaining)`);
        console.log(`Legendary 1-of-1: ${tierStats.legendary_1of1.count}/${tierStats.legendary_1of1.limit} (${tierStats.legendary_1of1.remaining} remaining)\n`);
        
        // Test 5: Supply information
        console.log('📊 Test 5: Supply Information\n');
        
        const supply = mintService.getSupplyInfo();
        console.log(`Total Minted: ${supply.totalMinted}/${supply.maxSupply}`);
        console.log(`Remaining: ${supply.remaining}`);
        console.log(`Progress: ${supply.percentMinted}%\n`);
        
        // Test 6: Calculate costs
        console.log('💰 Test 6: Pricing Calculation\n');
        
        const commonCost = mintService.calculateCost('common', 1);
        console.log(`Common NFT (x1):`);
        console.log(`   Price: ${commonCost.pricePerNFT}`);
        console.log(`   ODIN: ${commonCost.odinPerNFT.toLocaleString()}\n`);
        
        const rareCost = mintService.calculateCost('rare', 2);
        console.log(`Rare NFT (x2):`);
        console.log(`   Price per NFT: ${rareCost.pricePerNFT}`);
        console.log(`   Total: ${rareCost.totalCost}`);
        console.log(`   Total ODIN: ${rareCost.totalOdin.toLocaleString()}\n`);
        
        const legendaryCost = mintService.calculateCost('legendary', 1);
        console.log(`Legendary NFT (x1):`);
        console.log(`   Price: ${legendaryCost.pricePerNFT}`);
        console.log(`   ODIN: ${legendaryCost.odinPerNFT.toLocaleString()}\n`);
        
        // Test 7: Get next token to mint
        console.log('🔢 Test 7: Next Token to Mint\n');
        
        const nextTokenId = mintService.getNextTokenId();
        const nextTier = mintService.tierService.getTierForToken(nextTokenId);
        
        console.log(`   Next token ID: ${nextTokenId}`);
        console.log(`   Tier: ${nextTier}\n`);
        
        console.log('═══════════════════════════════════════');
        console.log('✅ All tests completed successfully!');
        console.log('═══════════════════════════════════════\n');
        
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error('Stack trace:', error.stack);
    } finally {
        mintService.close();
    }
}

testMetadataLoading();