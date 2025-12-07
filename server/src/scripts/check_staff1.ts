
import mongoose from 'mongoose';
import User from '../models/User';
import Schedule from '../models/Schedule';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.join(__dirname, '../../.env') });

const check = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI as string);
    console.log('Connected to DB');

    const users = await User.find({ username: { $regex: 'staff1' } });
    console.log('Users matching staff1:', users.map(u => ({ id: u._id, username: u.username, name: u.name })));

    if (users.length > 0) {
        for (const user of users) {
            const today = new Date();
            today.setHours(0,0,0,0);
            const todayStr = today.toISOString().split('T')[0]; // UTC date string, might be off by 1 day depending on time, but good enough for rough check

            const schedules = await Schedule.find({ staff: user._id }).sort({ date: 1 });
            console.log(`Total Schedule count for ${user.username}: ${schedules.length}`);
            
            const futureSchedules = schedules.filter(s => s.date >= '2025-12-07');
            console.log(`Future schedules (>= 2025-12-07): ${futureSchedules.length}`);
            console.log('Future dates:', futureSchedules.map(s => s.date));
        }
    }

  } catch (e) {
    console.error(e);
  } finally {
    await mongoose.disconnect();
  }
};

check();
