import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Calendar,
  Clock,
  MessageSquare,
  CheckSquare,
  ArrowRight,
  CheckCircle,
  Megaphone,
  Star,
  AlertCircle,
  Plus,
  Trash2,
  Pencil,
  X,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '@/lib/api'
import { useToast } from '@/hooks/use-toast'

interface HandoverItem {
  _id: string
  writer: {
    _id: string
    name: string
    username: string
  }
  content: string
  checklist: { item: string; done: boolean }[]
  confirmed: boolean
  confirmedBy: {
    _id: string
    name: string
    username: string
  }[]
  isImportant?: boolean
  createdAt: string
}

interface DashboardPost {
  _id: string
  title: string
  content: string
  createdAt: string
  type: 'announcement' | 'community'
  isImportant?: boolean // for announcements
  category?: string // for community
}

interface Goal {
  id: number
  text: string
  completed: boolean
}

const StaffDashboard = () => {
  const { toast } = useToast()
  const navigate = useNavigate()
  
  // Data States
  const [todaySchedule, setTodaySchedule] = useState<any>(null)
  const [elapsedTime, setElapsedTime] = useState<string>('근무 없음')
  const [handovers, setHandovers] = useState<HandoverItem[]>([])
  const [dashboardPosts, setDashboardPosts] = useState<DashboardPost[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  // Goals State
  const [goals, setGoals] = useState<Goal[]>([])
  const [isEditingGoals, setIsEditingGoals] = useState(false)
  const [newGoal, setNewGoal] = useState('')

  const username = localStorage.getItem('username') || '알바'

  useEffect(() => {
    setCurrentUserId(localStorage.getItem('userId'))
    fetchSchedule()
    fetchHandovers()
    fetchDashboardPosts()
    
    // Load Goals
    const saved = localStorage.getItem('staff_monthly_goals')
    if (saved) {
        setGoals(JSON.parse(saved))
    } else {
        setGoals([
            { id: 1, text: '매장 청소 및 정리', completed: false },
            { id: 2, text: '재고 확인 및 보충', completed: false },
            { id: 3, text: '유통기한 확인 및 폐기', completed: false },
        ])
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('staff_monthly_goals', JSON.stringify(goals))
  }, [goals])

  const fetchSchedule = async () => {
    try {
      const res = await api.get('/schedule/my')
      const d = new Date()
      const year = d.getFullYear()
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      const todayStr = `${year}-${month}-${day}`

      const todayShift = res.data.find((s: any) => s.date === todayStr)
      setTodaySchedule(todayShift)
    } catch (e) {
      console.error(e)
    }
  }

  const fetchHandovers = async () => {
    try {
      const res = await api.get('/handovers')
      setHandovers(res.data)
    } catch (e) {
      console.error(e)
    }
  }

  const fetchDashboardPosts = async () => {
    try {
      const [annoRes, commRes] = await Promise.all([
        api.get('/announcements/list'),
        api.get('/community/posts')
      ])

      const annos = annoRes.data.map((a: any) => ({ ...a, type: 'announcement' }))
      const comms = commRes.data.map((c: any) => ({ ...c, type: 'community' }))

      // Recent News (Mixed)
      const combined = [...annos, ...comms].sort((a: any, b: any) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      setDashboardPosts(combined.slice(0, 3))
    } catch (e) {
      console.error(e)
    }
  }

  // Goal Handlers
  const addGoal = () => {
    if (!newGoal.trim()) return
    const newItem: Goal = {
        id: Date.now(),
        text: newGoal,
        completed: false
    }
    setGoals([...goals, newItem])
    setNewGoal('')
  }

  const removeGoal = (id: number) => {
    setGoals(goals.filter(g => g.id !== id))
  }

  const toggleGoal = (id: number) => {
    setGoals(goals.map(g => g.id === id ? { ...g, completed: !g.completed } : g))
  }

  const handleConfirmHandover = async (handoverId: string) => {
    try {
      await api.put(`/handovers/${handoverId}/confirm`)
      toast({
        title: '인수인계 확인 완료',
        description: '이전 근무자의 인수인계를 확인했습니다.',
      })
      fetchHandovers()
    } catch (error) {
      toast({
        title: '오류 발생',
        description: '인수인계 확인 중 오류가 발생했습니다.',
        variant: 'destructive',
      })
    }
  }

  // Timer Logic
  useEffect(() => {
    if (!todaySchedule) {
        setElapsedTime('근무 없음')
        return
    }

    const updateTimer = () => {
        const now = new Date()
        const [sh, sm] = todaySchedule.startTime.split(':').map(Number)
        const [eh, em] = todaySchedule.endTime.split(':').map(Number)
        
        const start = new Date()
        start.setHours(sh, sm, 0, 0)
        
        const end = new Date()
        end.setHours(eh, em, 0, 0)
        if (end < start) end.setDate(end.getDate() + 1) // Overnight

        if (now < start) {
            const diff = start.getTime() - now.getTime()
            const hours = Math.floor(diff / (1000 * 60 * 60))
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
            setElapsedTime(`근무 시작 ${hours}시간 ${minutes}분 전`)
        } else if (now > end) {
            setElapsedTime('근무 종료')
        } else {
            const diff = now.getTime() - start.getTime()
            const hours = Math.floor(diff / (1000 * 60 * 60))
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
            setElapsedTime(`${hours}시간 ${minutes}분`)
        }
    }

    updateTimer()
    const interval = setInterval(updateTimer, 60000)
    return () => clearInterval(interval)
  }, [todaySchedule])

  const unconfirmedCount = handovers.filter(h => !h.confirmed).length
  const latestHandover = handovers[0]

  return (
    <div className="space-y-6">
      {/* ======= 3.a) 알바생 대시보드 - 근무시간표, 인수인계목록, 긴급공지, 체크리스트 ======= */}
      <div>
        <h1 className="text-3xl font-bold">안녕하세요, {username}님!</h1>
        <p className="text-muted-foreground mt-1">오늘도 화이팅하세요! 😊</p>
      </div>

      {/* ======= 3.a-1,2) 나의 근무 시간표 (금일/주간), 전/다음 근무자 인수인계 목록 ======= */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-l-4 border-l-primary">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              금일 근무
            </CardTitle>
          </CardHeader>
          <CardContent>
            {todaySchedule ? (
              <>
                <div className="text-2xl font-bold">
                  {todaySchedule.startTime} - {todaySchedule.endTime}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {todaySchedule.hours}시간 근무
                </p>
              </>
            ) : (
              <div className="text-xl font-bold text-muted-foreground">
                근무 없음
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-success">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="w-4 h-4" />
              근무 시간
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{elapsedTime}</div>
            {todaySchedule && elapsedTime !== '근무 없음' && elapsedTime !== '근무 종료' && !elapsedTime.includes('전') && (
                <p className="text-xs text-success mt-1">진행 중</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-warning">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              미확인 인수인계
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{unconfirmedCount}건</div>
            <p className="text-xs text-warning mt-1">확인 필요</p>
          </CardContent>
        </Card>
      </div>

      {/* Handover Sections */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowRight className="w-5 h-5 text-primary rotate-180" />전
              근무자 인수인계
            </CardTitle>
            <CardDescription>이전 근무자가 남긴 메시지</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {latestHandover ? (
                  <div className={`p-4 border rounded-lg ${latestHandover.isImportant ? 'bg-red-50 border-red-200' : 'bg-primary/5 border-primary/20'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{latestHandover.writer.name}</span>
                        {latestHandover.isImportant && <Badge variant="destructive" className="h-5 text-[10px] px-1.5">중요</Badge>}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(latestHandover.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </span>
                    </div>
                    <p className="text-sm mb-3 whitespace-pre-line">
                      {latestHandover.content}
                    </p>

                    {latestHandover.checklist && latestHandover.checklist.length > 0 && (
                        <div className="mb-3 space-y-1 bg-background/50 p-2 rounded">
                            <p className="text-xs font-medium text-muted-foreground mb-1">업무 체크리스트:</p>
                            {latestHandover.checklist.map((item, idx) => (
                                <div key={idx} className="flex items-center gap-2 text-xs">
                                    {item.done ? (
                                        <CheckCircle className="w-3 h-3 text-success" />
                                    ) : (
                                        <AlertCircle className="w-3 h-3 text-muted-foreground" />
                                    )}
                                    <span className={item.done ? 'text-muted-foreground line-through' : ''}>
                                        {item.item}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                    
                    {(!latestHandover.confirmedBy || !latestHandover.confirmedBy.some(u => u._id === currentUserId)) ? (
                        <Button size="sm" className="w-full" onClick={() => handleConfirmHandover(latestHandover._id)}>
                            <CheckSquare className="w-4 h-4 mr-2" />
                            인수인계 확인
                        </Button>
                    ) : (
                        <Button size="sm" variant="outline" className="w-full text-green-600 border-green-200 bg-green-50" disabled>
                            <CheckCircle className="w-4 h-4 mr-2" />
                            확인 완료
                        </Button>
                    )}
                  </div>
              ) : (
                  <div className="p-4 bg-muted/50 border border-border rounded-lg text-center text-muted-foreground text-sm">
                      등록된 인수인계가 없습니다.
                  </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowRight className="w-5 h-5 text-accent" />
              다음 근무자 인수인계
            </CardTitle>
            <CardDescription>다음 근무자에게 전달할 내용</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="p-4 bg-muted/50 border border-border rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-sm">나의 인수인계</span>
                </div>
                <p className="text-sm text-muted-foreground mb-3">
                  다음 근무자를 위해 인수인계를 작성해주세요.
                </p>
                <Button size="sm" variant="outline" className="w-full" onClick={() => navigate('/staff/handover')}>
                  인수인계 작성하기
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ======= 3.a-4) 이번 달 주요 사항, 3.a-3) 최근 소식 (공지 & 커뮤니티) ======= */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div className="space-y-1">
                <CardTitle className="flex items-center gap-2">
                <Star className="w-5 h-5 text-warning" />
                이번 달 주요 사항
                </CardTitle>
                <CardDescription>이달의 목표 및 중요 체크리스트</CardDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setIsEditingGoals(!isEditingGoals)}>
                {isEditingGoals ? <X className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
                {isEditingGoals && (
                    <div className="flex gap-2 mb-4">
                        <Input 
                            placeholder="새로운 목표 입력..." 
                            value={newGoal}
                            onChange={(e) => setNewGoal(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && addGoal()}
                        />
                        <Button size="icon" onClick={addGoal}>
                            <Plus className="w-4 h-4" />
                        </Button>
                    </div>
                )}

                <div className="space-y-2">
                    {goals.map(goal => (
                        <div key={goal.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card group">
                            <div 
                                className={`cursor-pointer rounded-full p-1 ${goal.completed ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
                                onClick={() => toggleGoal(goal.id)}
                            >
                                <CheckCircle className="w-4 h-4" />
                            </div>
                            <span className={`flex-1 text-sm ${goal.completed ? 'line-through text-muted-foreground' : ''}`}>
                                {goal.text}
                            </span>
                            {isEditingGoals && (
                                <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => removeGoal(goal.id)}>
                                    <Trash2 className="w-3 h-3" />
                                </Button>
                            )}
                        </div>
                    ))}
                    {goals.length === 0 && (
                        <div className="text-center text-sm text-muted-foreground py-8">
                            등록된 목표가 없습니다.
                        </div>
                    )}
                </div>
            </div>
          </CardContent>
        </Card>

        {/* ======= 3.a-3) 최근 소식 (공지 & 커뮤니티) ======= */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Megaphone className="w-5 h-5 text-primary" />
              최근 소식
            </CardTitle>
            <CardDescription>공지사항 및 커뮤니티 새 글</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {dashboardPosts.length > 0 ? (
                  dashboardPosts.map(post => (
                    <div key={post._id} className={`p-3 border rounded-lg ${post.isImportant ? 'bg-red-50 border-red-200' : 'bg-card border-border'}`}>
                        <div className="flex items-center gap-2 mb-1">
                            {post.type === 'announcement' ? (
                                <Badge variant={post.isImportant ? "destructive" : "default"} className="text-[10px] px-1.5 h-5">
                                    {post.isImportant ? '긴급' : '공지'}
                                </Badge>
                            ) : (
                                <Badge variant="secondary" className="text-[10px] px-1.5 h-5">
                                    커뮤니티
                                </Badge>
                            )}
                            <span className="text-xs text-muted-foreground">
                                {new Date(post.createdAt).toLocaleDateString()}
                            </span>
                        </div>
                        <p className="text-sm font-medium mb-1 truncate">
                            {post.title}
                        </p>
                        <p className="text-xs text-muted-foreground line-clamp-1">
                            {post.content}
                        </p>
                    </div>
                  ))
              ) : (
                  <div className="text-center text-sm text-muted-foreground py-4">
                      최근 소식이 없습니다.
                  </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default StaffDashboard
