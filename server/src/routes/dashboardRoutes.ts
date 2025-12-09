import express from 'express'
import Order from '../models/Order'
import Product from '../models/Product'
import User from '../models/User'
import Schedule from '../models/Schedule'
import Handover from '../models/Handover'
import Announcement from '../models/Announcement'
import { authMiddleware } from '../middleware/auth'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'

dayjs.extend(utc)
dayjs.extend(timezone)

const router = express.Router()

router.get('/summary', authMiddleware, async (req, res) => {
  try {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    // 1. 오늘 매출 & 시간대별 차트 데이터 (분석 페이지와 동일한 로직)
    const hourlyStats = await Order.aggregate([
      { $match: { createdAt: { $gte: todayStart } } },
      {
        $group: {
          _id: { $hour: '$createdAt' },
          sales: { $sum: '$totalAmount' },
        },
      },
      { $sort: { _id: 1 } },
    ])

    const salesData = Array.from({ length: 17 }, (_, i) => {
      const hour = i + 6 // 06시부터 22시까지
      const found = hourlyStats.find((h) => h._id === hour)
      return {
        time: `${String(hour).padStart(2, '0')}:00`,
        sales: found ? found.sales : 0,
      }
    })

    const todaySalesTotal = salesData.reduce((acc, cur) => acc + cur.sales, 0)

    // 2. 재고 현황 (파이 차트용) - 인벤토리/발주 페이지와 동일한 부족 기준 사용
    const products = await Product.find({})
    const defaultMinStock = 5 // 프런트 인벤토리 페이지 기본 minStock과 맞춤

    const normalizeQty = (p: any) => {
      const qty = typeof p.stock === 'number' ? p.stock : 0
      // 유통기한 지난 상품은 인벤토리 페이지에서 quantity 0으로 취급
      if (p.expiryDate) {
        const expDate = new Date(p.expiryDate)
        const todayStart = new Date()
        todayStart.setHours(0, 0, 0, 0)
        if (!isNaN(expDate.getTime()) && expDate < todayStart) return 0
      }
      return qty
    }

    const totalInventoryCount = products.reduce(
      (acc, cur) => acc + normalizeQty(cur),
      0
    )

    // 재고 상태 분류
    let normal = 0,
      low = 0,
      expiring = 0
    const now = new Date()
    const threeDaysLater = new Date()
    threeDaysLater.setDate(now.getDate() + 3)

    const lowStockItems: {
      id: string
      name: string
      stock: number
      minStock: number
      category?: string
    }[] = []

    products.forEach((p) => {
      const qty = normalizeQty(p)
      const rawMin =
        typeof (p as any).minStock === 'number'
          ? (p as any).minStock
          : defaultMinStock
      const minStock = rawMin > 0 ? rawMin : defaultMinStock

      const isExpiring =
        p.expiryDate && new Date(p.expiryDate) <= threeDaysLater
      const isLow = qty < minStock

      // 대시보드 부족 카운트는 인벤토리 페이지의 부족 알림과 동일하게 "minStock 미만" 기준으로 계산
      if (isLow) {
        lowStockItems.push({
          id: p._id.toString(),
          name: (p as any).name ?? '이름 없음',
          stock: qty,
          minStock,
          category: (p as any).category,
        })
      }

      // 파이 차트 분류는 임박 우선, 그 외 부족/정상 순으로 반영
      if (isExpiring) {
        expiring++
      } else if (isLow) {
        low++
      } else {
        normal++
      }
    })

    // [수정] 대시보드 상단 카드에는 '순수하게 재고가 부족한 상품 수'를 표시해야 함
    // 위 루프에서 lowStockItems 배열에 이미 정확하게 모아두었으므로 그 길이를 사용
    const pendingOrdersCount = lowStockItems.length

    console.log(
      `[Dashboard] Calculated pendingOrders: ${pendingOrdersCount}, Low items: ${lowStockItems
        .map((i) => i.name)
        .join(', ')}`
    )

    const inventoryData = [
      { name: '정상', value: normal, color: 'hsl(var(--success))' },
      { name: '부족', value: low, color: 'hsl(var(--warning))' }, // 발주 대기 대상
      { name: '임박', value: expiring, color: 'hsl(var(--destructive))' },
    ]

    // 3. 근무자 현황 (오늘 스케줄 기준)
    const staffCount = await User.countDocuments({ role: 'staff' })
    
    const todayStr = dayjs().tz('Asia/Seoul').format('YYYY-MM-DD')
    const nowTime = dayjs().tz('Asia/Seoul').format('HH:mm')

    const schedules = await Schedule.find({ date: todayStr }).populate('staff', 'name')
    
    const todayStaff = schedules.map((s: any) => {
        let status = '대기'
        // HH:mm 문자열 비교 (24시간제라 가능)
        if (nowTime >= s.startTime && nowTime <= s.endTime) {
            status = '근무중'
        } else if (nowTime > s.endTime) {
            status = '퇴근'
        }

        return {
            name: s.staff?.name || '삭제된 직원',
            shift: `${s.startTime} - ${s.endTime}`,
            status: status
        }
    })

    // 근무 시작 시간 순 정렬
    todayStaff.sort((a, b) => a.shift.localeCompare(b.shift))

    // 4. 중요 알림 (중요 인수인계 & 중요 공지사항)
    // 미확인 중요 인수인계 (최신순 3개)
    const importantHandovers = await Handover.find({ 
        isImportant: true, 
        confirmed: false 
    })
    .populate('writer', 'name')
    .sort({ createdAt: -1 })
    .limit(3)

    // 중요 공지사항 (최신순 3개)
    const importantAnnouncements = await Announcement.find({ 
        important: true 
    })
    .sort({ createdAt: -1 })
    .limit(3)

    res.json({
      stats: {
        todaySales: todaySalesTotal,
        totalInventory: totalInventoryCount,
        pendingOrders: pendingOrdersCount, // [수정] 정확한 재고 부족 수량 사용
        staffCount: staffCount,
      },
      salesData,
      inventoryData,
      todayStaff,
      alerts: {
        handovers: importantHandovers,
        announcements: importantAnnouncements
      }
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: '대시보드 로드 실패' })
  }
})

export default router
