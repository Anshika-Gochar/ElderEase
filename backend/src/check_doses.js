'use strict';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/elderease';

async function run() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to DB');

  const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
  const Medication = mongoose.model('Medication', new mongoose.Schema({}, { strict: false }));
  const DoseLog = mongoose.model('DoseLog', new mongoose.Schema({}, { strict: false }));

  const user = await User.findOne({ email: 'anshi@gmail.com' });
  if (!user) {
    console.log('User not found!');
    process.exit(1);
  }
  console.log('User:', user._id, user.name, user.email);

  const meds = await Medication.find({ elderId: user._id });
  console.log('\nMedications count:', meds.length);
  for (const m of meds) {
    console.log(`- ${m.name} | dose: ${m.dose} | isActive: ${m.isActive} | times: ${m.scheduledTimes}`);
  }

  const logs = await DoseLog.find({ elderId: user._id });
  console.log('\nDose logs count:', logs.length);
  for (const l of logs) {
    console.log(`- med: ${l.medicationId} | time: ${l.scheduledTime} | status: ${l.status}`);
  }

  await mongoose.disconnect();
  console.log('Disconnected');
}

run().catch(console.error);
