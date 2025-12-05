const { Client, Hbar } = require("@hashgraph/sdk");
const fs = require('fs').promises;
const path = require('path');
require("dotenv").config();

class PaymentService {
    constructor() {
        this.client = Client.forTestnet();
        this.client.setOperator(process.env.OPERATOR_ID, process.env.OPERATOR_KEY);
        
        this.treasuryId = process.env.OPERATOR_ID;
        this.pendingPayments = new Map();
        this.confirmedPayments = new Map();
        this.usedTransactionIds = new Set();
        
        // Load used transactions from file
        this.loadUsedTransactions();
        
        // Clean up every 5 minutes
        setInterval(() => this.cleanupOldPayments(), 5 * 60 * 1000);
        setInterval(() => this.saveUsedTransactions(), 2 * 60 * 1000);
    }

    /**
     * Generate unique payment ID
     */
    generatePaymentId(userAccountId, rarity) {
        return `${userAccountId}-${rarity}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Initiate payment process
     */
    initiatePayment(userAccountId, rarity, expectedAmount) {
        const paymentId = this.generatePaymentId(userAccountId, rarity);
        
        this.pendingPayments.set(paymentId, {
            userAccountId,
            rarity,
            expectedAmount,
            timestamp: Date.now(),
            status: 'pending',
            attempts: 0
        });

        console.log(`💰 Payment initiated: ${paymentId} for ${rarity} - ${expectedAmount.toString()}`);

        return {
            success: true,
            paymentId,
            treasuryAccountId: this.treasuryId,
            expectedAmount: expectedAmount.toString(),
            expectedTinybars: expectedAmount.toTinybars().toString(),
            rarity,
            expiresAt: Date.now() + (10 * 60 * 1000) // 10 minutes
        };
    }

    /**
     * Verify payment via Mirror Node
     */
    async verifyPayment(paymentId) {
        const payment = this.pendingPayments.get(paymentId);
        if (!payment) {
            throw new Error('Payment session not found or expired');
        }

        // Check if expired
        if (Date.now() - payment.timestamp > 10 * 60 * 1000) {
            this.pendingPayments.delete(paymentId);
            throw new Error('Payment session expired (10 minutes)');
        }

        payment.attempts++;

        try {
            // Get recent transactions to treasury
            const transactions = await this.getTreasuryTransactions(payment.timestamp);
            
            // Find matching transaction
            const validTransaction = transactions.find(tx => 
                tx.from === payment.userAccountId &&
                tx.to === this.treasuryId &&
                tx.amount === payment.expectedAmount.toTinybars().toString() &&
                new Date(tx.timestamp).getTime() >= payment.timestamp &&
                !this.usedTransactionIds.has(tx.transactionId)
            );

            if (validTransaction) {
                console.log(`✅ Payment verified: ${paymentId} - TX: ${validTransaction.transactionId}`);
                
                // Mark transaction as used
                this.usedTransactionIds.add(validTransaction.transactionId);
                
                // Move to confirmed payments
                payment.status = 'confirmed';
                payment.confirmedAt = Date.now();
                payment.transactionId = validTransaction.transactionId;
                this.confirmedPayments.set(paymentId, payment);
                this.pendingPayments.delete(paymentId);
                
                return true;
            }
            
            console.log(`❌ Payment not found for: ${paymentId} (attempt ${payment.attempts})`);
            return false;
            
        } catch (error) {
            console.error(`❌ Payment verification error for ${paymentId}:`, error.message);
            throw new Error(`Payment verification failed: ${error.message}`);
        }
    }

    /**
     * Query Hedera Mirror Node for treasury transactions
     */
    async getTreasuryTransactions(sinceTimestamp) {
        try {
            const mirrorNodeUrl = `https://testnet.mirrornode.hedera.com/api/v1/transactions`;
            
            const params = new URLSearchParams({
                'account.id': this.treasuryId,
                'transactiontype': 'CRYPTOTRANSFER',
                'limit': '100',
                'order': 'desc'
            });

            const response = await fetch(`${mirrorNodeUrl}?${params}`);
            if (!response.ok) {
                throw new Error(`Mirror node error: ${response.status}`);
            }

            const data = await response.json();
            
            return data.transactions
                .filter(tx => new Date(tx.consensus_timestamp).getTime() >= sinceTimestamp)
                .map(tx => this.parseTransaction(tx))
                .filter(tx => tx !== null);

        } catch (error) {
            console.error('Mirror node query failed:', error);
            return [];
        }
    }

    /**
     * Parse transaction from mirror node response
     */
    parseTransaction(tx) {
        try {
            // Find transfers involving our treasury
            if (!tx.transfers || !Array.isArray(tx.transfers)) {
                return null;
            }

            const treasuryTransfer = tx.transfers.find(t => 
                t.account === this.treasuryId && t.amount > 0
            );

            if (!treasuryTransfer) return null;

            // Find the sender (negative amount)
            const senderTransfer = tx.transfers.find(t => 
                t.amount < 0 && t.account !== this.treasuryId
            );

            if (!senderTransfer) return null;

            return {
                transactionId: tx.transaction_id,
                from: senderTransfer.account,
                to: this.treasuryId,
                amount: treasuryTransfer.amount.toString(),
                timestamp: tx.consensus_timestamp,
                memo: tx.memo || ''
            };
        } catch (error) {
            console.error('Error parsing transaction:', error);
            return null;
        }
    }

    /**
     * Get confirmed payment details
     */
    getConfirmedPayment(paymentId) {
        return this.confirmedPayments.get(paymentId);
    }

    /**
     * Remove confirmed payment after minting
     */
    consumePayment(paymentId) {
        if (this.confirmedPayments.has(paymentId)) {
            this.confirmedPayments.delete(paymentId);
            return true;
        }
        return false;
    }

    /**
     * Clean up old payments
     */
    cleanupOldPayments() {
        const now = Date.now();
        let cleaned = 0;

        // Clean pending payments older than 10 minutes
        for (const [paymentId, payment] of this.pendingPayments.entries()) {
            if (now - payment.timestamp > 10 * 60 * 1000) {
                this.pendingPayments.delete(paymentId);
                cleaned++;
            }
        }

        // Clean confirmed payments older than 1 hour
        for (const [paymentId, payment] of this.confirmedPayments.entries()) {
            if (now - payment.confirmedAt > 60 * 60 * 1000) {
                this.confirmedPayments.delete(paymentId);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            console.log(`🧹 Cleaned up ${cleaned} expired payments`);
        }
    }

    /**
     * Save used transactions to file
     */
    async saveUsedTransactions() {
        try {
            const dataDir = path.join(__dirname, '..', 'data');
            await fs.mkdir(dataDir, { recursive: true });
            
            const dataFile = path.join(dataDir, 'used-transactions.json');
            const data = {
                usedTransactionIds: Array.from(this.usedTransactionIds),
                lastUpdated: new Date().toISOString()
            };
            
            await fs.writeFile(dataFile, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error('Error saving used transactions:', error);
        }
    }

    /**
     * Load used transactions from file
     */
    async loadUsedTransactions() {
        try {
            const dataFile = path.join(__dirname, '..', 'data', 'used-transactions.json');
            const data = await fs.readFile(dataFile, 'utf8');
            const parsed = JSON.parse(data);
            
            this.usedTransactionIds = new Set(parsed.usedTransactionIds || []);
            console.log(`✅ Loaded ${this.usedTransactionIds.size} used transaction IDs`);
        } catch (error) {
            console.log('No previous transaction history found');
        }
    }

    /**
     * Get payment status
     */
    getPaymentStatus(paymentId) {
        if (this.confirmedPayments.has(paymentId)) {
            return { status: 'confirmed', payment: this.confirmedPayments.get(paymentId) };
        }
        if (this.pendingPayments.has(paymentId)) {
            return { status: 'pending', payment: this.pendingPayments.get(paymentId) };
        }
        return { status: 'not_found' };
    }
}

module.exports = PaymentService;