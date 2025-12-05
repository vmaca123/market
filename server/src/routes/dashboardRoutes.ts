import express from 'express'
import Order from '../models/Order'
import Product from '../models/Product'
import Staff from '../models/Staff'
import { authMiddleware } from '../middleware/auth'

const router = express.Router()

router.get('/summary', authMiddleware, async (req, res) => {
  try {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    // 1. 오늘 매출 & 시간대별 차트 데이터
    const todayOrders = await Order.find({ createdAt: { $gte: todayStart } })
    const todaySalesTotal = todayOrders.reduce(
      (acc, cur) => acc + cur.totalAmount,
      0
    )

    // 시간대별 집계 (06:00 ~ 22:00)
    const salesData = Array.from({ length: 17 }, (_, i) => {
      const hour = i + 6
      const salesInHour = todayOrders
        .filter((o) => new Date(o.createdAt).getHours() === hour)
        .reduce((acc, cur) => acc + cur.totalAmount, 0)
      return { time: `${String(hour).padStart(2, '0')}:00`, sales: salesInHour }
    })

    // 2. 재고 현황 (파이 차트용)
    const products = await Product.find({})
    const totalInventoryCount = products.reduce(
      (acc, cur) => acc + cur.stock,
      0
    )

    // 재고 상태 분류
    let normal = 0,
      low = 0,
      expiring = 0
    const now = new Date()
    const threeDaysLater = new Date()
    threeDaysLater.setDate(now.getDate() + 3)

    products.forEach((p) => {
      if (p.expiryDate && new Date(p.expiryDate) <= threeDaysLater) expiring++
      else if (p.stock <= p.minStock) low++
      else normal++
    })

    const inventoryData = [
      { name: '정상', value: normal, color: 'hsl(var(--success))' },
      { name: '부족', value: low, color: 'hsl(var(--warning))' }, // 발주 대기 대상
      { name: '임박', value: expiring, color: 'hsl(var(--destructive))' },
    ]

    // 3. 근무자 목록 (간단히 전체 목록 표시, 추후 스케줄 연동 필요)
    const staffList = await Staff.find({}).select('name status')
    const todayStaff = staffList.map((s) => ({
      name: s.name,
      shift: '09:00 - 18:00', // 임시 고정값 (스케줄 모델 연동 시 변경)
      status: s.status === 'active' ? '근무중' : '대기',
    }))

    res.json({
      stats: {
        todaySales: todaySalesTotal,
        totalInventory: totalInventoryCount,
        pendingOrders: low, // 재고 부족 품목 수 = 발주 대기
        staffCount: staffList.length,
      },
      salesData,
      inventoryData,
      todayStaff,
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: '대시보드 로드 실패' })
  }
})

export default router
