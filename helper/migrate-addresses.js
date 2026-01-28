require('dotenv').config();
const mongoose = require('mongoose');
 // if you use .env file for MONGO_URI


const User = require('../models/userSchema');     // ← change path if different
const Address = require('../models/addressSchema'); // ← change path if different

async function migrateAddresses() {
    try {
        // Connect using the variable from .env
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('✅ Connected to MongoDB →', process.env.MONGODB_URI);

        // Find users who still have the old embedded address array with content
        const users = await User.find({
            address: { $exists: true, $ne: [] }
        }).lean();

        console.log(`Found ${users.length} users with old embedded addresses`);

        let migrated = 0;

        for (const user of users) {
            if (user.address && user.address.length > 0) {
                const mappedAddresses = user.address.map(old => {
                    return {
                        name:   old.fullname  || user.fullname || 'Unknown Name',
                        phone:  old.phone     || '',
                        pincode: Number(old.pincode) || 0,
                        city:   old.city      || '',
                        state:  old.state     || ''
                    };
                });

                const newDoc = new Address({
                    userId: user._id,
                    address: mappedAddresses
                });

                await newDoc.save();
                console.log(`Migrated ${mappedAddresses.length} address(es) for user ${user._id} (${user.fullname || user.email || 'no name'})`);

                migrated++;
            }
        }

        console.log(`\nMigration completed. ${migrated} users processed.`);
        console.log('Next steps:');
        console.log('1. Remove "address" field from User schema');
        console.log('2. Restart your server');
        console.log('3. Test block/unblock functionality');
    } catch (err) {
        console.error('Migration error:', err.message);
        console.error(err.stack);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
}

// Start the migration
migrateAddresses();