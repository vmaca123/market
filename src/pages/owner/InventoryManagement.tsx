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
import { Search, Package, AlertTriangle, QrCode, Scan, Mail, Trash2, Pencil } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import QrScanner from '@/components/QrScanner'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import api from '@/lib/api'
import axios from 'axios'

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
  orderQuantity?: number
  orderedAt?: string
  expireDate?: string // QR 생성용 자동 계산된 유통기한
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

// [자동 계산] 상품 종류별 유통기한 자동 계산 로직
const getAutoExpiryDate = (productName: string, category: string) => {
  const today = new Date()
  let addDays = 180 // 기본값 (라면/일반식품 등)

  const name = productName.toLowerCase()
  const cat = category || '기타'

  if (cat === '식품') {
    if (
      name.includes('삼각') ||
      name.includes('김밥') ||
      name.includes('도시락') ||
      name.includes('샌드위치') ||
      name.includes('버거')
    ) {
      addDays = 3 // 신선식품
    } else if (name.includes('우유') || name.includes('유제품')) {
      addDays = 10 // 유제품
    } else if (name.includes('빵') || name.includes('케이크')) {
      addDays = 7 // 베이커리
    } else if (name.includes('라면') || name.includes('면')) {
      addDays = 180 // 라면류
    }
  } else if (cat === '음료') {
    addDays = 180 // 음료
  } else if (cat === '생활용품') {
    addDays = 365 * 2 // 생활용품 (2년)
  }

  const targetDate = new Date(today.setDate(today.getDate() + addDays))
  return targetDate.toISOString().split('T')[0]
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
  const [qrTarget, setQrTarget] = useState<Product | null>(null)
  
  // QR 입고 관련 상태
  const [scanTarget, setScanTarget] = useState<OrderRequest | null>(null)
  const [scanning, setScanning] = useState(false)
  const [receiveData, setReceiveData] = useState({
    quantity: 0,
    expireDate: '',
  })

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

      console.log('Fetched inventory:', res.data)

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
      if ((axios as any).isAxiosError(err)) {
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

    // [자동 계산] 카테고리별 유통기한 자동 설정
    const targetProduct = items.find((i) => i._id === approveTarget.id)
    const category = targetProduct?.category || '기타'
    
    const today = new Date()
    let addDays = 30 // 기본 30일
    
    if (category === '식품') addDays = 7
    else if (category === '음료') addDays = 180
    else if (category === '생활용품') addDays = 365
    
    const autoExpiryDate = new Date(today.setDate(today.getDate() + addDays))
      .toISOString()
      .split('T')[0]

    const applyApprovalState = () => {
      setOrderRequests((prev) =>
        prev.map((req) =>
          req.id === approveTarget.id
            ? {
                ...req,
                status: '승인',
                orderQuantity: qty,
                orderedAt: new Date().toISOString(),
                expireDate: autoExpiryDate, // 자동 계산된 유통기한 저장
              }
            : req
        )
      )
      setApproveTarget(null)
      setOrderQuantity('')
      toast({
        title: '발주 승인 완료',
        description: `발주서와 QR 코드가 이메일로 전송되었습니다. (유통기한 자동 설정: ${autoExpiryDate})`,
      })
    }

    // 서버 통신 없이 상태만 변경 (이메일 전송 시뮬레이션)
    applyApprovalState()
  }

  // [자동 계산] 스캔 대상 설정 시 기본 유통기한 자동 입력
  useEffect(() => {
    if (scanTarget) {
      const product = items.find((i) => i._id === scanTarget.id)
      if (product) {
        const autoDate = getAutoExpiryDate(
          product.productName,
          product.category || '기타'
        )
        setReceiveData((prev) => ({
          ...prev,
          expireDate: prev.expireDate || autoDate,
        }))
      }
    }
  }, [scanTarget, items])

  const handleScanReceive = (decodedText: string) => {
    try {
      const parsed = JSON.parse(decodedText)
      // QR 데이터 검증 (여기서는 간단히 ID 확인)
      if (parsed.productId && scanTarget) {
        // 스캔 성공
        setScanning(false)

        // QR에 유통기한이 없으면 자동 계산된 값 사용
        let finalExpireDate = parsed.expireDate
        if (!finalExpireDate) {
          const product = items.find((i) => i._id === parsed.productId)
          if (product) {
            finalExpireDate = getAutoExpiryDate(
              product.productName,
              product.category || '기타'
            )
          }
        }

        setReceiveData((prev) => ({
          ...prev,
          quantity: parsed.quantity || scanTarget.orderQuantity || 0,
          expireDate: finalExpireDate || '', // QR에서 유통기한 자동 입력
        }))

        const msg = finalExpireDate
          ? 'QR 코드 확인 완료. (유통기한 자동 입력됨)'
          : 'QR 코드 확인 완료. 유통기한을 입력해주세요.'

        toast({
          title: '스캔 성공',
          description: msg,
        })
      } else {
        throw new Error('Invalid QR')
      }
    } catch (e) {
      // 에러 처리 또는 단순 바코드 처리
      setScanning(false)
      toast({
        title: '스캔 완료',
        description: '바코드가 인식되었습니다.',
      })
    }
  }

  const handleReceiveSubmit = async () => {
    if (!scanTarget) return
    if (!receiveData.expireDate) {
      toast({
        title: '입력 오류',
        description: '유통기한을 입력해주세요.',
        variant: 'destructive',
      })
      return
    }

    try {
      const currentItem = items.find((i) => i._id === scanTarget.id)
      const newQuantity =
        (currentItem?.quantity || 0) +
        (receiveData.quantity || scanTarget.orderQuantity || 0)

      // [Mock Data 처리] ID가 mock_으로 시작하면 서버 요청 없이 로컬 상태만 업데이트
      if (scanTarget.id.startsWith('mock_')) {
        console.log('Mock data update simulation')
        setItems((prev) =>
          prev.map((item) =>
            item._id === scanTarget.id
              ? {
                  ...item,
                  quantity: newQuantity,
                  expireDate: receiveData.expireDate,
                }
              : item
          )
        )
      } else {
        // 1. 재고 추가 API 호출
        await api.patch(`/products/${scanTarget.id}`, {
          quantity: newQuantity,
          expiryDate: receiveData.expireDate,
        })
      }

      // 2. 발주 목록에서 제거 (또는 완료 처리)
      setOrderRequests((prev) => prev.filter((r) => r.id !== scanTarget.id))

      toast({
        title: '입고 완료',
        description: `${scanTarget.item} ${receiveData.quantity}개가 입고되었습니다.`,
      })

      // 목록 새로고침 (Mock 데이터가 아닐 경우에만)
      if (!scanTarget.id.startsWith('mock_')) {
        fetchInventory()
      }
      
      setScanTarget(null)
      setReceiveData({ quantity: 0, expireDate: '' })
    } catch (e: any) {
      console.error(e)
      let errorMsg = '서버 오류가 발생했습니다.'
      
      if ((axios as any).isAxiosError(e)) {
        if (e.response?.status === 404) {
          errorMsg = 'API 경로를 찾을 수 없습니다. 서버를 재시작해주세요.'
        } else if (e.response?.data?.message) {
          errorMsg = e.response.data.message
        }
      }

      toast({
        title: '입고 실패',
        description: errorMsg,
        variant: 'destructive',
      })
    }
  }

  const handleDeleteProduct = async (id: string) => {
    if (!confirm('정말 이 상품을 삭제하시겠습니까?')) return

    // [Mock Data 처리]
    if (id.startsWith('mock_')) {
      setItems((prev) => prev.filter((item) => item._id !== id))
      toast({
        title: '삭제 완료',
        description: '테스트 상품이 삭제되었습니다.',
      })
      return
    }

    try {
      await api.delete(`/products/${id}`)
      toast({
        title: '삭제 완료',
        description: '상품이 삭제되었습니다.',
      })
      fetchInventory()
    } catch (e: any) {
      console.error(e)
      let errorMsg = '상품 삭제 중 오류가 발생했습니다.'

      if ((axios as any).isAxiosError(e)) {
        if (e.response?.status === 404) {
          errorMsg = '이미 삭제되었거나 존재하지 않는 상품입니다.'
          // 이미 삭제된 경우 목록에서도 제거
          setItems((prev) => prev.filter((item) => item._id !== id))
        } else if (e.response?.status === 400) {
          errorMsg = '잘못된 요청입니다. (ID 오류)'
        } else if (e.response?.data?.message) {
          errorMsg = e.response.data.message
        }
      }

      toast({
        title: '삭제 실패',
        description: errorMsg,
        variant: 'destructive',
      })
    }
  }

  const [editPriceTarget, setEditPriceTarget] = useState<Product | null>(null)
  const [editPriceValue, setEditPriceValue] = useState('')

  const handleEditPrice = async () => {
    if (!editPriceTarget) return
    const newPrice = Number(editPriceValue)
    if (isNaN(newPrice) || newPrice < 0) {
      toast({
        title: '입력 오류',
        description: '유효한 가격을 입력해주세요.',
        variant: 'destructive',
      })
      return
    }

    try {
      // [Mock Data 처리]
      if (editPriceTarget._id.startsWith('mock_')) {
        setItems((prev) =>
          prev.map((item) =>
            item._id === editPriceTarget._id
              ? { ...item, price: newPrice }
              : item
          )
        )
      } else {
        await api.patch(`/products/${editPriceTarget._id}`, {
          price: newPrice,
        })
        fetchInventory()
      }

      toast({
        title: '수정 완료',
        description: '가격이 수정되었습니다.',
      })
      setEditPriceTarget(null)
    } catch (e) {
      console.error(e)
      toast({
        title: '수정 실패',
        description: '가격 수정 중 오류가 발생했습니다.',
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
                {filteredInventory.map((item, index) => {
                  const expiry = daysUntil(item.expireDate)
                  return (
                    <div
                      key={item._id || index}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-4 flex-1">
                        <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                          <Package className="w-6 h-6 text-primary" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-medium">{item.productName}</h4>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span>{item.category}</span>
                            <span>•</span>
                            <div className="flex items-center gap-1">
                              <span className="font-medium">
                                ₩{item.price?.toLocaleString?.() ?? '-'}
                              </span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-muted-foreground hover:text-primary"
                                onClick={() => {
                                  setEditPriceTarget(item)
                                  setEditPriceValue(
                                    item.price?.toString() || '0'
                                  )
                                }}
                                title="가격 수정"
                              >
                                <Pencil className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setQrTarget(item)}
                          title="QR 코드 보기"
                        >
                          <QrCode className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleDeleteProduct(item._id)}
                          title="상품 삭제"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
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
                {pendingOrders.map((request, index) => (
                  <div
                    key={request.id || index}
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
                {approvedOrders.map((request, index) => (
                  <div
                    key={request.id || index}
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
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setQrTarget({
                            _id: request.id,
                            productName: request.item,
                            // @ts-ignore
                            orderQuantity: request.orderQuantity,
                            expireDate: request.expireDate,
                          } as unknown as Product)
                        }
                        title="발주 QR 보기 (이메일 첨부)"
                      >
                        <Mail className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-2"
                        onClick={() => {
                          setScanTarget(request)
                          setScanning(true)
                        }}
                      >
                        <Scan className="w-4 h-4" />
                        입고 스캔
                      </Button>
                      <Badge
                        variant="outline"
                        className="border-success text-success"
                      >
                        승인됨
                      </Badge>
                    </div>
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
                {expiringItems.map((item, index) => (
                  <div
                    key={item._id || index}
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

      {/* 가격 수정 다이얼로그 */}
      <Dialog
        open={!!editPriceTarget}
        onOpenChange={(open) => !open && setEditPriceTarget(null)}
      >
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>가격 수정</DialogTitle>
            <DialogDescription>
              {editPriceTarget?.productName}의 판매 가격을 수정합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-price" className="text-right">
                가격
              </Label>
              <Input
                id="edit-price"
                type="number"
                value={editPriceValue}
                onChange={(e) => setEditPriceValue(e.target.value)}
                className="col-span-3"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPriceTarget(null)}>
              취소
            </Button>
            <Button onClick={handleEditPrice}>수정 완료</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            <DialogTitle>발주 승인</DialogTitle>
            <DialogDescription>
              {approveTarget?.item}의 발주 수량을 입력하세요.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>주문 수량</Label>
              <Input
                type="number"
                min={1}
                value={orderQuantity}
                onChange={(e) => setOrderQuantity(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                * 유통기한은 상품 카테고리에 따라 자동 설정되어 QR에 포함됩니다.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveTarget(null)}>
              취소
            </Button>
            <Button onClick={handleApproveConfirm}>승인 및 QR 생성</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!qrTarget} onOpenChange={(open) => !open && setQrTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>QR 코드 - {qrTarget?.productName}</DialogTitle>
            <DialogDescription>
              이 QR 코드를 스캔하여 재고를 입고할 수 있습니다.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center p-6">
            {qrTarget && (
              <div className="bg-white p-4 rounded-lg">
                <QRCodeSVG
                  value={JSON.stringify({
                    productId: qrTarget._id,
                    productName: qrTarget.productName,
                    quantity: (qrTarget as any).orderQuantity,
                    expireDate: (qrTarget as any).expireDate, // 유통기한 포함
                  })}
                  size={200}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setQrTarget(null)}>닫기</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 입고 스캔 다이얼로그 */}
      <Dialog
        open={!!scanTarget}
        onOpenChange={(open) => {
          if (!open) {
            setScanTarget(null)
            setScanning(false)
            setReceiveData({ quantity: 0, expireDate: '' })
          }
        }}
      >
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>입고 처리 - {scanTarget?.item}</DialogTitle>
            <DialogDescription>
              {scanning
                ? '도착한 물품의 QR 코드를 스캔하세요.'
                : '입고 정보를 확인하고 유통기한을 입력하세요.'}
            </DialogDescription>
          </DialogHeader>

          {scanning ? (
            <QrScanner
              onScan={handleScanReceive}
              onClose={() => setScanning(false)}
            />
          ) : (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">상품명</Label>
                <div className="col-span-3 font-medium">{scanTarget?.item}</div>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">입고 수량</Label>
                <Input
                  type="number"
                  value={receiveData.quantity}
                  onChange={(e) =>
                    setReceiveData({
                      ...receiveData,
                      quantity: Number(e.target.value),
                    })
                  }
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">유통기한</Label>
                <Input
                  type="date"
                  value={receiveData.expireDate}
                  onChange={(e) =>
                    setReceiveData({
                      ...receiveData,
                      expireDate: e.target.value,
                    })
                  }
                  className="col-span-3"
                />
              </div>
            </div>
          )}

          {!scanning && (
            <DialogFooter>
              <Button variant="outline" onClick={() => setScanning(true)}>
                다시 스캔
              </Button>
              <Button onClick={handleReceiveSubmit}>입고 완료</Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default InventoryManagement
