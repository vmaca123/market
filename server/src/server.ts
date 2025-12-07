import express from 'express'
import dotenv from 'dotenv'
import cors from 'cors'
import { connectDB } from './config/db'

import authRoutes from './routes/authRoutes'
import staffRoutes from './routes/staffRoutes'
import announcementRoutes from './routes/announcementRoutes'
import communityRoutes from './routes/communityRoutes'
import qrRoutes from './routes/qrRoutes'
import productRoutes from './routes/productRoutes'
import kioskRoutes from './routes/kioskRoutes'
import analyticsRoutes from './routes/analyticsRoutes'
import dashboardRoutes from './routes/dashboardRoutes'
import scheduleRoutes from './routes/scheduleRoutes'
import subRoutes from './routes/subRoutes'
import handoverRoutes from './routes/handoverRoutes'
dotenv.config()

const app = express()

app.use(cors())
app.use(express.json())

// DB 연결
connectDB()

// Routes
app.use('/api/auth', authRoutes)
app.use('/api/staff', staffRoutes)
app.use('/api/announcements', announcementRoutes)
app.use('/api/community', communityRoutes)
app.use('/api/products', productRoutes)
app.use('/api/kiosk', kioskRoutes)
app.use('/api/analytics', analyticsRoutes)
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/schedule', scheduleRoutes)
app.use('/api/sub', subRoutes)
app.use('/api/handovers', handoverRoutes)
app.use('/api', qrRoutes)

const PORT = process.env.PORT || 5000

app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
