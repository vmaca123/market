import { useEffect, useMemo, useState } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Search, Package, AlertTriangle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import axios from 'axios'

// [수정] 외부 파일 의존성 제거를 위해 api 인스턴스를 내부에서 정의
const api = axios.create({
  baseURL: 'http://localhost:5000/api', // 서버 주소에 맞게 조정 필요
})

// 요청 인터셉터 추가 (토큰 자동 포함)
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

type Product = {
  _id: string
  productName: string
  entryDate: string
  expireDate: string
  quantity: number
  scannedAt?: string
  category?: string
  minStock?: number
  price?: number
}

type OrderRequest = {
  id: string
  item: string
  quantity: number
  requestedBy: string
  date: string
  status: '대기' | '승인' | '거절'
  /*************  ✨ Windsurf Command ⭐  *************/
  /**
   * Fetches inventory data from the backend API.
   * If the request is successful, the received data is mapped to include default values for category, minStock, and price.
   * The mapped data is then set to the items state.
   * If the request fails, a toast error message is displayed.
   * Finally, the loading state is set to false.
   */
  /*******  34d91ae8-c998-4c15-b3f0-01d65f2cf339  *******/ orderQuantity?: number
  orderedAt?: string
}

const isExpired = (date?: string) => {
  if (!date) return false
  const target = new Date(date)
  if (isNaN(target.getTime())) return false
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  return target < todayStart
}

const ORDER_STORAGE_KEY = 'owner_inventory_order_requests'

const loadSavedOrders = (): OrderRequest[] => {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(ORDER_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed
  } catch (e) {
    console.warn('발주 상태 로드 실패:', e)
  }
  return []
}

const mergeOrderRequests = (
  lowStockRequests: OrderRequest[],
  existing: OrderRequest[]
) => {
  const merged: OrderRequest[] = []
  const lowMap = new Map(lowStockRequests.map((r) => [r.id, r]))

  existing.forEach((req) => {
    const low = lowMap.get(req.id)
    const keep = req.status !== '대기' || !!low
    if (!keep) return
    if (low) lowMap.delete(req.id)

    const base = low ? { ...low, ...req } : { ...req }
    merged.push({
      ...base,
      orderQuantity: req.orderQuantity ?? low?.orderQuantity,
      orderedAt: req.orderedAt ?? low?.orderedAt,
      status: req.status ?? low?.status ?? '대기',
    })
  })

  lowMap.forEach((req) => merged.push(req))

  return merged
}

const MOCK_PRODUCTS: Product[] = [
  {
    _id: 'mock_1',
    productName: '코카콜라 제로',
    entryDate: new Date().toISOString(),
    expireDate: '2024-12-31',
    quantity: 50,
    category: '음료',
    minStock: 10,
    price: 1500,
  },
  {
    _id: 'mock_2',
    productName: '삼각김밥 참치마요',
    entryDate: new Date().toISOString(),
    expireDate: new Date(Date.now() + 86400000 * 2).toISOString(), // 2일 뒤
    quantity: 2, // 재고 부족 (자동 발주 대상)
    category: '식품',
    minStock: 5,
    price: 1200,
  },
  {
    _id: 'mock_3',
    productName: '신라면 컵',
    entryDate: new Date().toISOString(),
    expireDate: '2025-06-01',
    quantity: 100,
    category: '식품',
    minStock: 20,
    price: 1100,
  },
  {
    _id: 'mock_4',
    productName: '생수 500ml',
    entryDate: new Date().toISOString(),
    expireDate: '2025-12-31',
    quantity: 8,
    category: '음료',
    minStock: 10,
    price: 800,
  },
]

const InventoryManagement = () => {
  const { toast } = useToast()
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('전체')
  const [sortMode, setSortMode] = useState<'default' | 'lowStock' | 'expiry'>(
    'default'
  )
  const [items, setItems] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [orderRequests, setOrderRequests] = useState<OrderRequest[]>(
    () => loadSavedOrders()
  )
  const [approveTarget, setApproveTarget] = useState<OrderRequest | null>(null)
  const [orderQuantity, setOrderQuantity] = useState('')

  // [안전장치 3] 날짜 계산 로직 강화 (함수 선언으로 호이스팅)
  function daysUntil(date?: string) {
    if (!date) return null
    const target = new Date(date).getTime()
    if (isNaN(target)) return null // 날짜 형식이 이상하면 null 반환
    const today = new Date().setHours(0, 0, 0, 0)
    const diff = Math.ceil((target - today) / (1000 * 60 * 60 * 24))
    // 유통기한이 이미 지났으면 음수 대신 0으로 표시
    return Math.max(diff, 0)
  }

  const fetchInventory = async () => {
    setLoading(true)

    const token = localStorage.getItem('token')
    if (!token) {
      console.warn('No auth token found. Using mock data.')
      setItems(MOCK_PRODUCTS)
      toast({
        title: '데모 모드',
        description: '로그인되지 않았습니다. 테스트 데이터를 표시합니다.',
      })
      setLoading(false)
      return
    }

    try {
      const res = await api.get('/products')

      // [안전장치 1] 데이터가 배열인지 확인
      if (!Array.isArray(res.data)) {
        console.error('데이터 형식이 배열이 아닙니다:', res.data)
        setItems([])
        return
      }

      const mapped = res.data.map((item: any) => {
        const expired = isExpired(item.expiryDate)
        return {
          _id: item._id,
          // [안전장치 2] 필드값이 없을 경우 기본값 할당 (Null Check)
          productName: item.name || '이름 없음',
          quantity:
            typeof item.stock === 'number'
              ? expired
                ? 0
                : item.stock
              : 0, // 유통기한 지난 상품은 0으로 표시
          category: item.category || '기타',
          price: typeof item.price === 'number' ? item.price : 0,
          minStock: typeof item.minStock === 'number' ? item.minStock : 5,
          expireDate: item.expiryDate || '',
          // createdAt이 없으면 현재 시간으로 대체 (흰화면 방지 핵심)
          entryDate: item.createdAt || new Date().toISOString(),
        }
      })

      setItems(mapped)
    } catch (err: any) {
      // [수정] 콘솔 에러 대신 경고로 표시하여 사용자 불안감 감소
      console.warn('API Error (using mock data):', err.message)

      let errorMsg = '재고 목록을 불러오지 못했습니다.'
      if (axios.isAxiosError(err)) {
        if (err.response?.status === 401) {
          errorMsg = '인증이 만료되었습니다. (테스트용 데이터를 표시합니다)'
        } else if (err.code === 'ERR_NETWORK') {
          errorMsg = '서버에 연결할 수 없습니다. (테스트용 데이터를 표시합니다)'
        }
      }

      toast({
        title: '데이터 로드 실패',
        description: errorMsg,
        variant: 'destructive',
      })

      // 에러 발생 시 UI 확인을 위해 모의 데이터로 설정
      setItems(MOCK_PRODUCTS)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchInventory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filteredInventory = useMemo(() => {
    const filtered = items.filter((item) => {
      const nameMatch = item.productName
        ? item.productName.toLowerCase().includes(searchTerm.toLowerCase())
        : false
      const categoryMatch =
        selectedCategory === '전체' || item.category === selectedCategory
      return nameMatch && categoryMatch
    })

    const sorted = [...filtered]
    if (sortMode === 'lowStock') {
      const getStatusRank = (item: Product) => {
        const expiryDays = daysUntil(item.expireDate)
        const isLow = item.quantity < (item.minStock ?? 0)
        const isExpiring =
          item.quantity > 0 && expiryDays !== null && expiryDays <= 7
        if (isLow) return 0
        if (isExpiring) return 1
        return 2
      }

      sorted.sort((a, b) => {
        const rankA = getStatusRank(a)
        const rankB = getStatusRank(b)
        if (rankA !== rankB) return rankA - rankB

        // 동등 그룹 내에서는 부족 정도/임박 순으로 정렬
        if (rankA === 0) {
          const aDiff = (a.quantity ?? 0) - (a.minStock ?? 0)
          const bDiff = (b.quantity ?? 0) - (b.minStock ?? 0)
          return aDiff - bDiff
        }
        if (rankA === 1) {
          const aDays = daysUntil(a.expireDate) ?? Number.MAX_SAFE_INTEGER
          const bDays = daysUntil(b.expireDate) ?? Number.MAX_SAFE_INTEGER
          return aDays - bDays
        }
        return (a.productName ?? '').localeCompare(b.productName ?? '')
      })
    } else if (sortMode === 'expiry') {
      sorted.sort((a, b) => {
        const aDays = daysUntil(a.expireDate)
        const bDays = daysUntil(b.expireDate)

        // 재고 0인 상품은 가장 아래로
        const rankA = a.quantity <= 0 ? 1 : 0
        const rankB = b.quantity <= 0 ? 1 : 0
        if (rankA !== rankB) return rankA - rankB

        if (aDays === null && bDays === null) return 0
        if (aDays === null) return 1
        if (bDays === null) return -1
        if (aDays === bDays) {
          return (a.productName ?? '').localeCompare(b.productName ?? '')
        }
        return aDays - bDays
      })
    }
    return sorted
  }, [items, searchTerm, selectedCategory])

  const lowStockItems = filteredInventory.filter(
    (item) => item.quantity < (item.minStock ?? 0)
  )
  const expiringItems = filteredInventory.filter((item) => {
    const d = daysUntil(item.expireDate)
    // 재고가 0인 품목은 임박 목록/표시에서 제외
    return item.quantity > 0 && d !== null && d <= 7
  })

  // 자동 발주 목록 생성 로직
  useEffect(() => {
    const next = items
      .filter((item) => item.quantity <= 2)
      .map((item) => {
        // [안전장치 4] 날짜 변환 시 에러 방지
        let dateStr = '-'
        try {
          const d = item.scannedAt || item.entryDate
          if (d) {
            const dateObj = new Date(d)
            if (!isNaN(dateObj.getTime())) {
              dateStr = dateObj.toLocaleDateString()
            }
          }
        } catch (e) {
          dateStr = '-'
        }

        return {
          id: item._id,
          item: item.productName,
          quantity: item.quantity,
          requestedBy: '시스템 감지',
          date: dateStr,
          status: '대기' as const,
        }
      })

    // 기존 상태 유지(승인/거절) 후 새 데이터 병합
    setOrderRequests((prev) => mergeOrderRequests(next, prev))
  }, [items])

  // 승인/거절 상태 로컬 저장
  useEffect(() => {
    if (typeof window === 'undefined') return
    localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(orderRequests))
  }, [orderRequests])

  const pendingOrders = orderRequests.filter((r) => r.status === '대기')
  const approvedOrders = orderRequests.filter((r) => r.status === '승인')

  const handleOrderApproval = (
    orderId: string,
    action: 'approve' | 'reject'
  ) => {
    setOrderRequests((prev) =>
      prev.map((req) =>
        req.id === orderId
          ? { ...req, status: action === 'approve' ? '승인' : '거절' }
          : req
      )
    )
    toast({
      title: action === 'approve' ? '발주 승인 완료' : '발주 거절',
      description: `발주 요청이 ${
        action === 'approve' ? '승인' : '거절'
      }되었습니다.`,
    })
  }

  const openApproveDialog = (request: OrderRequest) => {
    setApproveTarget(request)
    setOrderQuantity(request.quantity.toString())
  }

  const handleApproveConfirm = async () => {
    if (!approveTarget) return
    const qty = Number(orderQuantity)
    if (Number.isNaN(qty) || qty <= 0) {
      toast({
        title: '입력 오류',
        description: '주문 수량을 1 이상 입력하세요.',
        variant: 'destructive',
      })
      return
    }

    const applyApprovalState = () => {
      setOrderRequests((prev) =>
        prev.map((req) =>
          req.id === approveTarget.id
            ? {
                ...req,
                status: '승인',
                orderQuantity: qty,
                orderedAt: new Date().toISOString(),
              }
            : req
        )
      )
      setApproveTarget(null)
      setOrderQuantity('')
      toast({
        title: '발주 승인 완료',
        description: `${approveTarget.item}을(를) ${qty}개 발주했습니다.`,
      })
    }

    const token = localStorage.getItem('token')
    if (!token) {
      setItems((prev) =>
        prev.map((item) =>
          item._id === approveTarget.id
            ? { ...item, quantity: item.quantity + qty }
            : item
        )
      )
      applyApprovalState()
      return
    }

    try {
      await api.patch(`/products/${approveTarget.id}/stock`, {
        quantity: qty,
      })

      setItems((prev) =>
        prev.map((item) =>
          item._id === approveTarget.id
            ? { ...item, quantity: item.quantity + qty }
            : item
        )
      )
      applyApprovalState()
      await fetchInventory()
    } catch (err: any) {
      console.error('발주 승인 처리 실패:', err)
      toast({
        title: '승인 실패',
        description: '재고 업데이트에 실패했습니다. 다시 시도해주세요.',
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="space-y-6">
      {/* ======= 2.b) 재고/발주 관리 - DB목록, 검색/필터링, 발주요청 알림, 자동추천 및 신청, 유통기한임박 상품 ======= */}
      <div>
        <h1 className="text-3xl font-bold">재고/발주 관리</h1>
        <p className="text-muted-foreground mt-1">
          재고 현황을 확인하고 발주를 관리하세요
        </p>
      </div>

      <Tabs defaultValue="inventory" className="space-y-4">
        <TabsList>
          <TabsTrigger value="inventory">재고 목록</TabsTrigger>
          <TabsTrigger value="orders">발주 요청</TabsTrigger>
          <TabsTrigger value="expiring">유통기한 임박</TabsTrigger>
        </TabsList>

        <TabsContent value="inventory" className="space-y-4">
          {/* ======= 2.b-1) 물품 검색 및 필터링, 2.b-4) 발주 품목 자동 추천 및 발주 신청 ======= */}
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="물품 검색..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select
              value={selectedCategory}
              onValueChange={setSelectedCategory}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="전체">전체</SelectItem>
                <SelectItem value="식품">식품</SelectItem>
                <SelectItem value="음료">음료</SelectItem>
                <SelectItem value="생활용품">생활용품</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={sortMode}
              onValueChange={(v) =>
                setSortMode(v as 'default' | 'lowStock' | 'expiry')
              }
            >
              <SelectTrigger className="w-44">
                <SelectValue placeholder="정렬" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">기본 정렬</SelectItem>
                <SelectItem value="lowStock">재고 부족 우선</SelectItem>
                <SelectItem value="expiry">유통기한 임박 우선</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={fetchInventory}
              disabled={loading}
            >
              {loading ? '불러오는 중...' : '새로고침'}
            </Button>
          </div>

          {/* 알림 카드 */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="border-warning">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-warning" />
                  재고 부족 알림
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-warning">
                  {lowStockItems.length}개
                </div>
                <p className="text-xs text-muted-foreground">
                  최소 재고 미달 품목
                </p>
              </CardContent>
            </Card>

            <Card className="border-destructive">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-destructive" />
                  유통기한 임박
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-destructive">
                  {expiringItems.length}개
                </div>
                <p className="text-xs text-muted-foreground">
                  7일 이내 유통기한
                </p>
              </CardContent>
            </Card>
          </div>

          {/* 재고 목록 */}
          <Card>
            <CardHeader>
              <CardTitle>재고 목록</CardTitle>
              <CardDescription>
                전체 {filteredInventory.length}개 품목
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {filteredInventory.map((item) => {
                  const expiry = daysUntil(item.expireDate)
                  return (
                    <div
                      key={item._id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-4 flex-1">
                        <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                          <Package className="w-6 h-6 text-primary" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-medium">{item.productName}</h4>
                          <p className="text-sm text-muted-foreground">
                            {item.category} • ₩
                            {item.price?.toLocaleString?.() ?? '-'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <p className="text-sm text-muted-foreground">재고</p>
                          <p
                            className={`font-medium ${
                              item.quantity < (item.minStock ?? 0)
                                ? 'text-warning'
                                : ''
                            }`}
                          >
                            {item.quantity}개
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-muted-foreground">
                            유통기한
                          </p>
                          <p
                            className={`font-medium ${
                              expiry !== null && expiry <= 3 && item.quantity > 0
                                ? 'text-destructive'
                                : ''
                            }`}
                          >
                            {item.quantity <= 0
                              ? '-'
                              : expiry === null
                                ? '-'
                                : `D-${expiry}`}
                          </p>
                        </div>
                        {item.quantity < (item.minStock ?? 0) && (
                          <Badge
                            variant="outline"
                            className="border-warning text-warning"
                          >
                            부족
                          </Badge>
                        )}
                        {item.quantity > 0 && expiry !== null && expiry <= 3 && (
                          <Badge
                            variant="outline"
                            className="border-destructive text-destructive"
                          >
                            임박
                          </Badge>
                        )}
                      </div>
                    </div>
                  )
                })}
                {filteredInventory.length === 0 && (
                  <div className="text-center text-muted-foreground py-8">
                    재고가 없습니다.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ======= 2.b-3) 발주 요청 알림 목록 ======= */}
        <TabsContent value="orders" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>발주 요청 목록</CardTitle>
              <CardDescription>
                수량 2개 이하 품목을 자동 감지해 보여줍니다.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {pendingOrders.map((request) => (
                  <div
                    key={request.id}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div>
                      <h4 className="font-medium">{request.item}</h4>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => openApproveDialog(request)}
                      >
                        승인
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          handleOrderApproval(request.id, 'reject')
                        }
                      >
                        거절
                      </Button>
                    </div>
                  </div>
                ))}
                {pendingOrders.length === 0 && (
                  <div className="text-center text-muted-foreground py-6">
                    2개 이하 재고가 없습니다.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>승인 목록</CardTitle>
              <CardDescription>승인된 발주 요청</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {approvedOrders.map((request) => (
                  <div
                    key={request.id}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div>
                      <h4 className="font-medium">{request.item}</h4>
                      <p className="text-xs text-muted-foreground">
                        주문: {request.orderQuantity ?? 0}개 •{' '}
                        {request.orderedAt
                          ? new Date(request.orderedAt).toLocaleDateString()
                          : '-'}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className="border-success text-success"
                    >
                      승인됨
                    </Badge>
                  </div>
                ))}
                {approvedOrders.length === 0 && (
                  <div className="text-center text-muted-foreground py-6">
                    승인된 발주가 없습니다.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ======= 2.b-5) 유통기한 임박 상품 목록 ======= */}
        <TabsContent value="expiring" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>유통기한 임박 상품</CardTitle>
              <CardDescription>
                7일 이내 유통기한이 도래하는 상품
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {expiringItems.map((item) => (
                  <div
                    key={item._id}
                    className="flex items-center justify-between p-4 border border-destructive/20 bg-destructive/5 rounded-lg"
                  >
                    <div className="flex items-center gap-4">
                      <AlertTriangle className="w-5 h-5 text-destructive" />
                      <div>
                        <h4 className="font-medium">{item.productName}</h4>
                        <p className="text-sm text-muted-foreground">
                          재고: {item.quantity}개
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge
                        variant="outline"
                        className="border-destructive text-destructive"
                      >
                        {daysUntil(item.expireDate) !== null
                          ? `D-${daysUntil(item.expireDate)}`
                          : '-'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog
        open={!!approveTarget}
        onOpenChange={(open) => {
          if (!open) {
            setApproveTarget(null)
            setOrderQuantity('')
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>발주 수량 입력</DialogTitle>
            <DialogDescription>
              {approveTarget?.item}에 대해 주문할 수량을 입력하세요.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              type="number"
              min={1}
              value={orderQuantity}
              onChange={(e) => setOrderQuantity(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveTarget(null)}>
              취소
            </Button>
            <Button onClick={handleApproveConfirm}>전송</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default InventoryManagement
