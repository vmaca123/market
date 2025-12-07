
import mongoose from 'mongoose';
import User from '../models/User';
import Schedule from '../models/Schedule';
import SubRequest from '../models/SubRequest';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.join(__dirname, '../../.env') });

const check = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI as string);
    console.log('Connected to DB');

    const users = await User.find({ username: { $regex: 'staff3' } });
    console.log('Users matching staff3:', users.map(u => ({ id: u._id, username: u.username, name: u.name })));

    if (users.length > 0) {
        for (const user of users) {
            const schedules = await Schedule.find({ staff: user._id }).sort({ date: 1 });
            console.log(`Schedule count for ${user.username}: ${schedules.length}`);
            console.log('Schedule dates:', schedules.map(s => s.date));
            
            const subRequests = await SubRequest.find({ requester: user._id });
            console.log(`SubRequest count for ${user.username}: ${subRequests.length}`);
        }
    }
    
    const allSchedules = await Schedule.countDocuments();
    console.log('Total schedules in DB:', allSchedules);

  } catch (e) {
    console.error(e);
  } finally {
    await mongoose.disconnect();
  }
};

check();
