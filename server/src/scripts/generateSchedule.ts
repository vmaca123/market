import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User';
import Schedule from '../models/Schedule';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const generateSchedule = async () => {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error('MONGO_URI is not defined');
    }
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB Connected');

    // 1. Fetch Users
    let allUsers = await User.find({});
    if (allUsers.length < 5) {
      console.log(`Only ${allUsers.length} users found. Creating dummy users...`);
      const needed = 5 - allUsers.length;
      for (let i = 0; i < needed; i++) {
        await new User({
          username: `staff_auto_${Date.now()}_${i}`,
          password: 'password',
          name: `추가직원${i + 1}`,
          role: 'staff',
        }).save();
      }
      allUsers = await User.find({});
    }
    const scheduleUsers = allUsers.slice(0, 5);
    console.log('Scheduling for:', scheduleUsers.map(u => u.name).join(', '));

    const year = 2025;
    const month = 11; // December
    const startDate = new Date(year, month, 1);
    const endDate = new Date(year, month + 1, 0);

    // 2. Clear existing
    await Schedule.deleteMany({
      date: { 
        $gte: `${year}-${String(month + 1).padStart(2, '0')}-01`, 
        $lte: `${year}-${String(month + 1).padStart(2, '0')}-${endDate.getDate()}` 
      }
    });
    console.log('Cleared existing schedules.');

    // 3. Generate Weekly Pattern (Matrix of 5 users x 7 days)
    // 1 = Work, 0 = Rest. Each row sum = 5. Each col sum >= 3.
    
    // Simple valid pattern for 5 users, 5 days work, min 3 coverage:
    // Day: M T W T F S S
    // U1:  1 1 1 1 1 0 0 (Rest Sat, Sun)
    // U2:  0 1 1 1 1 1 0 (Rest Mon, Sun)
    // U3:  0 0 1 1 1 1 1 (Rest Mon, Tue)
    // U4:  1 0 0 1 1 1 1 (Rest Tue, Wed)
    // U5:  1 1 0 0 1 1 1 (Rest Wed, Thu)
    
    // Let's check column sums:
    // M: 1+0+0+1+1 = 3
    // T: 1+1+0+0+1 = 3
    // W: 1+1+1+0+0 = 3
    // T: 1+1+1+1+0 = 4
    // F: 1+1+1+1+1 = 5
    // S: 0+1+1+1+1 = 4
    // S: 0+0+1+1+1 = 3
    // All days have >= 3 workers. Perfect.
    
    const workPattern = [
        [1, 1, 1, 1, 1, 0, 0], // User 0
        [0, 1, 1, 1, 1, 1, 0], // User 1
        [0, 0, 1, 1, 1, 1, 1], // User 2
        [1, 0, 0, 1, 1, 1, 1], // User 3
        [1, 1, 0, 0, 1, 1, 1], // User 4
    ];

    // Helper to generate slots for N people covering 24h
    const generateSlots = (n: number) => {
        const slots = [];
        const duration = 24 / n; // e.g. 8 or 6 or 4.8
        // We want integer hours if possible, but 24/5 = 4.8 is tricky.
        // But our pattern has 3, 4, or 5 workers.
        // 3 workers -> 8h each (0-8, 8-16, 16-24)
        // 4 workers -> 6h each (0-6, 6-12, 12-18, 18-24)
        // 5 workers -> 4.8h? Let's do 4h, 5h mix? Or just 5 shifts.
        // 24 = 5 + 5 + 5 + 5 + 4.
        
        let current = 0;
        for(let i=0; i<n; i++) {
            let dur = Math.floor(24/n);
            // Distribute remainder
            if (i < (24 % n)) dur++; 
            
            const start = current;
            const end = current + dur;
            
            slots.push({
                startTime: `${String(start).padStart(2, '0')}:00`,
                endTime: end === 24 ? '24:00' : `${String(end).padStart(2, '0')}:00`
            });
            current = end;
        }
        return slots;
    };

    const schedules = [];

    for (let d = 1; d <= endDate.getDate(); d++) {
        const date = new Date(year, month, d);
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        
        // Day index: Mon=0 ... Sun=6
        // date.getDay(): Sun=0, Mon=1 ... Sat=6
        let dayIdx = date.getDay() - 1;
        if (dayIdx === -1) dayIdx = 6; // Sun

        // Find workers for this day
        const workers = [];
        for(let u=0; u<5; u++) {
            if (workPattern[u][dayIdx] === 1) {
                workers.push(scheduleUsers[u]);
            }
        }

        // Generate slots
        const slots = generateSlots(workers.length);
        
        // Shuffle workers to assign slots randomly? 
        // Or keep consistent? "복사 붙 해도 괜찮아" -> Consistent is fine.
        // But let's shuffle slightly so one person doesn't always get night shift?
        // Actually, fixed rotation is better for health usually. 
        // But let's just assign in order for now.
        
        for(let i=0; i<workers.length; i++) {
            schedules.push({
                staff: workers[i]._id,
                date: dateStr,
                startTime: slots[i].startTime,
                endTime: slots[i].endTime,
                status: 'scheduled'
            });
        }
    }

    await Schedule.insertMany(schedules);
    console.log(`Successfully created ${schedules.length} schedules.`);

  } catch (error) {
    console.error(error);
  } finally {
    await mongoose.disconnect();
  }
};

generateSchedule();
