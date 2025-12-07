import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  BarChart3,
  Package,
  Users,
  AlertCircle,
  TrendingUp,
  ShoppingCart,
  Megaphone,
  ClipboardList
} from 'lucide-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import axios from 'axios'
import { useToast } from '@/hooks/use-toast'

// API 설정
const api = axios.create({
  baseURL: 'http://localhost:5000/api',
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

interface DashboardData {
  stats: {
    todaySales: number
    totalInventory: number
    pendingOrders: number
    staffCount: number
  }
  salesData: any[]
  inventoryData: any[]
  todayStaff: any[]
  alerts: {
    handovers: any[]
    announcements: any[]
  }
}

const OwnerDashboard = () => {
  const { toast } = useToast()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)

  // 상태 관리
  const [data, setData] = useState<DashboardData>({
    stats: {
      todaySales: 0,
      totalInventory: 0,
      pendingOrders: 0,
      staffCount: 0,
    },
    salesData: [],
    inventoryData: [],
    todayStaff: [],
    alerts: {
      handovers: [],
      announcements: []
    }
  })

  // 데이터 로드
  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await api.get('/dashboard/summary')
        setData(res.data as DashboardData)
      } catch (err) {
        console.error(err)
        toast({
          title: '오류',
          description: '대시보드 정보를 불러오지 못했습니다.',
          variant: 'destructive',
        })
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  if (loading) {
    return <div className="p-8 text-center">대시보드 로딩 중...</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">관리자 대시보드</h1>
        <p className="text-muted-foreground mt-1">
          실시간 매장 현황을 확인하세요
        </p>
      </div>

      {/* 요약 카드 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-l-4 border-l-primary">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              오늘 매출
            </CardTitle>
            <TrendingUp className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ₩{data.stats.todaySales.toLocaleString()}
            </div>
            <p className="text-xs text-success mt-1">실시간 집계 중</p>
          </CardContent>
        </Card>

        <Card 
          className="border-l-4 border-l-success cursor-pointer hover:bg-accent/50 transition-colors"
          onClick={() => navigate('/owner/inventory')}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              전체 재고
            </CardTitle>
            <Package className="w-4 h-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data.stats.totalInventory}개
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              총 보유 상품 수량
            </p>
          </CardContent>
        </Card>

        <Card 
          className="border-l-4 border-l-warning cursor-pointer hover:bg-accent/50 transition-colors"
          onClick={() => navigate('/owner/inventory')}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              재고 부족(발주)
            </CardTitle>
            <ShoppingCart className="w-4 h-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data.stats.pendingOrders}건
            </div>
            <p className="text-xs text-warning mt-1">확인 필요</p>
          </CardContent>
        </Card>

        <Card 
          className="border-l-4 border-l-accent cursor-pointer hover:bg-accent/50 transition-colors"
          onClick={() => navigate('/owner/staff')}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              등록 직원
            </CardTitle>
            <Users className="w-4 h-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.stats.staffCount}명</div>
            <p className="text-xs text-muted-foreground mt-1">총 직원 수</p>
          </CardContent>
        </Card>
      </div>

      {/* 차트 영역 */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>실시간 시간대별 매출</CardTitle>
            <CardDescription>오늘 06:00 ~ 22:00 현황</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data.salesData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--border))"
                />
                <XAxis dataKey="time" stroke="hsl(var(--muted-foreground))" />
                <YAxis stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{ borderRadius: '8px' }}
                  formatter={(val: number) => `₩${val.toLocaleString()}`}
                />
                <Line
                  type="monotone"
                  dataKey="sales"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={{ fill: 'hsl(var(--primary))' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>재고 현황 요약</CardTitle>
            <CardDescription>상태별 재고 비율</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={data.inventoryData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) =>
                    `${name} ${(percent * 100).toFixed(0)}%`
                  }
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {data.inventoryData.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* 하단 정보 */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* 직원 목록 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              근무자 현황
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.todayStaff.map((staff: any, index: number) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 bg-secondary rounded-lg"
                >
                  <div>
                    <p className="font-medium">{staff.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {staff.shift}
                    </p>
                  </div>
                  <span
                    className={`text-xs px-2 py-1 rounded-full ${
                      staff.status === '근무중'
                        ? 'bg-success/20 text-success'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {staff.status}
                  </span>
                </div>
              ))}
              {data.todayStaff.length === 0 && (
                <p className="text-center text-muted-foreground py-4">
                  등록된 직원이 없습니다.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 주요 알람 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-warning" />
              주요 알람
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {/* 재고 부족 */}
              {data.stats.pendingOrders > 0 && (
                <div 
                    className="flex items-start gap-3 p-3 bg-warning/10 border border-warning/20 rounded-lg cursor-pointer hover:bg-warning/20 transition-colors"
                    onClick={() => navigate('/owner/inventory')}
                >
                  <AlertCircle className="w-5 h-5 text-warning mt-0.5" />
                  <div>
                    <p className="font-medium text-sm">재고 부족 알림</p>
                    <p className="text-xs text-muted-foreground">
                      {data.stats.pendingOrders}개 품목의 재고가 부족합니다.
                    </p>
                  </div>
                </div>
              )}

              {/* 중요 인수인계 */}
              {data.alerts?.handovers?.map((h: any) => (
                <div 
                    key={h._id} 
                    className="flex items-start gap-3 p-3 bg-destructive/10 border border-destructive/20 rounded-lg cursor-pointer hover:bg-destructive/20 transition-colors"
                    onClick={() => navigate('/staff/handover')}
                >
                  <ClipboardList className="w-5 h-5 text-destructive mt-0.5" />
                  <div>
                    <p className="font-medium text-sm text-destructive">중요 인수인계 (미확인)</p>
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {h.writer?.name}: {h.content}
                    </p>
                  </div>
                </div>
              ))}

              {/* 중요 공지사항 */}
              {data.alerts?.announcements?.map((a: any) => (
                <div 
                    key={a._id} 
                    className="flex items-start gap-3 p-3 bg-primary/10 border border-primary/20 rounded-lg cursor-pointer hover:bg-primary/20 transition-colors"
                    onClick={() => navigate('/owner/announcements')}
                >
                  <Megaphone className="w-5 h-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium text-sm text-primary">중요 공지사항</p>
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {a.title}
                    </p>
                  </div>
                </div>
              ))}

              {/* 알림 없음 */}
              {data.stats.pendingOrders === 0 && 
               (!data.alerts?.handovers || data.alerts.handovers.length === 0) && 
               (!data.alerts?.announcements || data.alerts.announcements.length === 0) && (
                <div className="flex items-start gap-3 p-3 bg-secondary/50 border rounded-lg">
                    <AlertCircle className="w-5 h-5 text-muted-foreground mt-0.5" />
                    <div>
                    <p className="font-medium text-sm">시스템 정상 가동</p>
                    <p className="text-xs text-muted-foreground">
                        확인할 중요 알림이 없습니다.
                    </p>
                    </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default OwnerDashboard
