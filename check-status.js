const mongoose = require('mongoose');

async function checkStatus() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/bpos-dev', {
      serverSelectionTimeoutMS: 5000,
    });
    
    const Order = require('./src/models/Order').default;
    const Integration = require('./src/models/Integration').default;
    
    console.log('Connecting to MongoDB...');
    
    // Check GF-617
    const order = await Order.findOne({ $or: [{ shortId: 'GF-617' }, { externalOrderId: /GF-617|001857075319-C76TLBVTGFUECE/ }] }).lean();
    
    console.log('\n=== GF-617 Order Status ===');
    if (order) {
      console.log(`Status: ${order.status}`);
      console.log(`External ID: ${order.externalOrderId}`);
      console.log(`Short ID: ${order.shortId}`);
      console.log(`Updated: ${order.updatedAt}`);
      console.log(`Platform: ${order.source}`);
    } else {
      console.log('GF-617 order not found');
    }
    
    // Check Grab/Be integrations pause status
    const grabInteg = await Integration.findOne({ provider: 'grab', isActive: true }).lean();
    const beInteg = await Integration.findOne({ provider: 'be', isActive: true }).lean();
    
    console.log('\n=== Grab Integration Sample ===');
    if (grabInteg) {
      console.log(`ID: ${grabInteg._id}`);
      console.log(`Store: ${grabInteg.externalStoreName}`);
      console.log(`Is Active: ${grabInteg.isActive}`);
    }
    
    console.log('\n=== Be Integration Sample ===');
    if (beInteg) {
      console.log(`ID: ${beInteg._id}`);
      console.log(`Store: ${beInteg.externalStoreName}`);
      console.log(`Is Active: ${beInteg.isActive}`);
    }
    
    const grabCount = await Integration.countDocuments({ provider: 'grab' });
    const beCount = await Integration.countDocuments({ provider: 'be' });
    console.log(`\n=== Total Integrations ===`);
    console.log(`Grab: ${grabCount}`);
    console.log(`Be: ${beCount}`);
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

checkStatus();
