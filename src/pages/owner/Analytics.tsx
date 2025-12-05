import { useEffect, useState } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { TrendingUp, DollarSign, Package, Trash2 } from 'lucide-react'
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

const Analytics = () => {
  const { toast } = useToast()

  // 상태 관리
  const [data, setData] = useState({
    hourlySales: [],
    weeklySales: [],
    monthlySales: [],
    popularProducts: [],
    unpopularProducts: [],
    summary: { totalSales: 0, totalItems: 0 },
  })
  const [loading, setLoading] = useState(true)

  // 데이터 불러오기
  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await api.get('/analytics/dashboard')
        setData(res.data)
      } catch (err) {
        console.error(err)
        toast({
          title: '데이터 로드 실패',
          description: '분석 데이터를 불러오지 못했습니다.',
          variant: 'destructive',
        })
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  if (loading) {
    return <div className="p-8 text-center">데이터 분석 중...</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">데이터 분석</h1>
        <p className="text-muted-foreground mt-1">
          실시간 매출 통계와 상품 분석 데이터
        </p>
      </div>

      {/* 요약 통계 */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              이번 주 매출
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ₩{data.summary.totalSales.toLocaleString()}
            </div>
            <p className="text-xs text-success flex items-center gap-1 mt-1">
              <TrendingUp className="w-3 h-3" /> 매출 집계 중
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Package className="w-4 h-4" />총 판매량
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data.summary.totalItems.toLocaleString()}개
            </div>
            <p className="text-xs text-muted-foreground mt-1">누적 판매 수량</p>
          </CardContent>
        </Card>

        {/* 폐기 비용은 아직 Order 모델과 연동되지 않아 임시 데이터 유지 또는 추후 개발 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Trash2 className="w-4 h-4" />
              폐기 비용
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-muted-foreground">-</div>
            <p className="text-xs text-muted-foreground mt-1">집계 준비 중</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">평균 객단가</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data.summary.totalItems > 0
                ? `₩${Math.round(
                    data.summary.totalSales / data.summary.totalItems
                  ).toLocaleString()}`
                : '0'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">개당 평균 매출</p>
          </CardContent>
        </Card>
      </div>

      {/* 판매 통계 탭 */}
      <Tabs defaultValue="hourly" className="space-y-4">
        <TabsList>
          <TabsTrigger value="hourly">시간대별</TabsTrigger>
          <TabsTrigger value="weekly">요일별</TabsTrigger>
          <TabsTrigger value="monthly">월별</TabsTrigger>
        </TabsList>

        <TabsContent value="hourly">
          <Card>
            <CardHeader>
              <CardTitle>오늘 시간대별 매출</CardTitle>
              <CardDescription>06:00 ~ 22:00 실시간 집계</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={data.hourlySales}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border))"
                  />
                  <XAxis dataKey="hour" stroke="hsl(var(--muted-foreground))" />
                  <YAxis stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    contentStyle={{ borderRadius: '8px' }}
                    formatter={(value: number) => `₩${value.toLocaleString()}`}
                  />
                  <Bar
                    dataKey="sales"
                    fill="hsl(var(--primary))"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="weekly">
          <Card>
            <CardHeader>
              <CardTitle>주간 요일별 매출</CardTitle>
              <CardDescription>이번 주 요일별 판매 추이</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={data.weeklySales}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border))"
                  />
                  <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" />
                  <YAxis stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    contentStyle={{ borderRadius: '8px' }}
                    formatter={(value: number) => `₩${value.toLocaleString()}`}
                  />
                  <Line
                    type="monotone"
                    dataKey="sales"
                    stroke="hsl(var(--primary))"
                    strokeWidth={3}
                    dot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="monthly">
          <Card>
            <CardHeader>
              <CardTitle>월별 매출 통계</CardTitle>
              <CardDescription>올해 월별 매출 누적</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={data.monthlySales}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border))"
                  />
                  <XAxis
                    dataKey="month"
                    stroke="hsl(var(--muted-foreground))"
                  />
                  <YAxis stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    contentStyle={{ borderRadius: '8px' }}
                    formatter={(value: number) => `₩${value.toLocaleString()}`}
                  />
                  <Bar
                    dataKey="sales"
                    fill="hsl(var(--chart-2))"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* 상품 분석 */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>🔥 인기 상품 TOP 5</CardTitle>
            <CardDescription>판매 수량 기준</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.popularProducts.map((product: any, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 bg-success/5 border border-success/20 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-success/20 rounded-full flex items-center justify-center font-bold text-success">
                      {index + 1}
                    </div>
                    <div>
                      <p className="font-medium">{product.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {product.sales}개 판매
                      </p>
                    </div>
                  </div>
                  <p className="font-bold text-success">
                    ₩{product.revenue.toLocaleString()}
                  </p>
                </div>
              ))}
              {data.popularProducts.length === 0 && (
                <p className="text-center text-muted-foreground py-4">
                  판매 데이터가 없습니다.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>📉 판매 저조 상품</CardTitle>
            <CardDescription>판매량이 낮은 상품</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.unpopularProducts.map((product: any, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 bg-warning/5 border border-warning/20 rounded-lg"
                >
                  <div>
                    <p className="font-medium">{product.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {product.sales}개 판매
                    </p>
                  </div>
                  <p className="font-medium text-warning">
                    ₩{product.revenue.toLocaleString()}
                  </p>
                </div>
              ))}
              {data.unpopularProducts.length === 0 && (
                <p className="text-center text-muted-foreground py-4">
                  데이터가 부족합니다.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default Analytics
