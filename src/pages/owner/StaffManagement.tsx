// src/pages/owner/StaffManagement.tsx
'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { UserPlus, Trash2, Edit2, Clock } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import api from '@/lib/api'

// 직원 타입
interface Staff {
  _id: string
  name: string
  phone: string
  username: string
}

type ScheduleStatus = 'scheduled' | 'completed' | 'cancelled'

// 서버가 주는 스케줄 데이터
interface ScheduleItem {
  _id: string
  staffId: string
  staffName: string
  date: string
  startTime: string
  endTime: string
  status: ScheduleStatus
}

// 프론트 표시용 (근무시간 계산 포함)
interface DaySchedule {
  date: string
  dayLabel: string
  shifts: (ScheduleItem & { hours: number })[]
}

type SubStatus =
  | 'requested'
  | 'approved_by_owner'
  | 'accepted_by_sub'
  | 'approved_final'
  | 'cancelled'

interface SubRequestItem {
  _id: string
  scheduleId: {
    _id: string
    date: string
    startTime: string
    endTime: string
  }
  requesterName: string
  substituteName?: string
  status: SubStatus
}

// 시간 계산
const calcHours = (start: string, end: string): number => {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const startMin = sh * 60 + sm
  let endMin = eh * 60 + em
  if (endMin <= startMin) endMin += 24 * 60
  return (endMin - startMin) / 60
}

const getSubStatusLabel = (status: SubStatus) => {
  switch (status) {
    case 'requested':
      return '요청됨'
    case 'approved_by_owner':
      return '대타 모집 중'
    case 'accepted_by_sub':
      return '대타 확정'
    case 'approved_final':
      return '최종 승인'
    case 'cancelled':
      return '취소됨'
  }
}

const StaffManagement = () => {
  const { toast } = useToast()

  const [staffList, setStaffList] = useState<Staff[]>([])
  const [weekSchedule, setWeekSchedule] = useState<DaySchedule[]>([])
  const [pendingSubs, setPendingSubs] = useState<SubRequestItem[]>([])
  const [approvedSubs, setApprovedSubs] = useState<SubRequestItem[]>([])

  const [selectedStaff, setSelectedStaff] = useState('')
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('18:00')

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<ScheduleItem | null>(null)
  const [editDate, setEditDate] = useState('')
  const [editStartTime, setEditStartTime] = useState('09:00')
  const [editEndTime, setEditEndTime] = useState('18:00')

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [newStaffName, setNewStaffName] = useState('')
  const [newStaffPhone, setNewStaffPhone] = useState('')

  // ---------- API ----------
  const fetchStaff = async () => {
    const res = await api.get<Staff[]>('/staff/list')
    setStaffList(res.data)
  }

  const fetchWeekSchedule = async () => {
    const res = await api.get<ScheduleItem[]>('/schedule/week')
    const days = ['일', '월', '화', '수', '목', '금', '토']

    // hours 계산
    const items = res.data.map((s) => ({
      ...s,
      hours: calcHours(s.startTime, s.endTime),
    }))

    const grouped: Record<string, typeof items> = {}
    items.forEach((s) => {
      const d = s.date.split('T')[0]
      if (!grouped[d]) grouped[d] = []
      grouped[d].push(s)
    })

    const result: DaySchedule[] = Object.entries(grouped)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, shifts]) => ({
        date,
        dayLabel: `${days[new Date(date).getDay()]} (${date})`,
        shifts,
      }))

    setWeekSchedule(result)
  }

  const fetchSubRequests = async () => {
    const [pending, approved] = await Promise.all([
      api.get<SubRequestItem[]>('/sub/owner?mode=pending'),
      api.get<SubRequestItem[]>('/sub/owner?mode=approved'),
    ])
    setPendingSubs(pending.data)
    setApprovedSubs(approved.data)
  }

  useEffect(() => {
    fetchStaff()
    fetchWeekSchedule()
    fetchSubRequests()
  }, [])

  // ---------- 스케줄 등록 ----------
  const handleAddSchedule = async () => {
    if (!selectedStaff || !date) {
      toast({
        title: '입력 오류',
        description: '직원/날짜 필수',
        variant: 'destructive',
      })
      return
    }

    await api.post('/schedule/add', {
      staffId: selectedStaff,
      date: date.split('T')[0],
      startTime,
      endTime,
    })

    toast({ title: '스케줄 등록 완료' })
    fetchWeekSchedule()
  }

  // ---------- 스케줄 수정 ----------
  const openEditDialog = (shift: ScheduleItem) => {
    setEditTarget(shift)
    setEditDate(shift.date.split('T')[0])
    setEditStartTime(shift.startTime)
    setEditEndTime(shift.endTime)
    setIsEditDialogOpen(true)
  }

  const handleUpdateSchedule = async () => {
    if (!editTarget) return
    await api.put(`/schedule/${editTarget._id}`, {
      date: editDate,
      startTime: editStartTime,
      endTime: editEndTime,
    })
    toast({ title: '수정 완료' })
    setIsEditDialogOpen(false)
    fetchWeekSchedule()
  }

  // ---------- 스케줄 삭제 ----------
  const handleDeleteSchedule = async (shift: ScheduleItem) => {
    if (!confirm('삭제할까요?')) return
    await api.delete(`/schedule/${shift._id}`)
    toast({ title: '삭제 완료' })
    fetchWeekSchedule()
  }

  // ---------- 근무자 삭제 ----------
  const handleDeleteStaff = async (id: string) => {
    if (!confirm('정말 삭제? 직원과 스케줄도 함께 삭제됩니다.')) return
    await api.delete(`/staff/${id}`)
    toast({ title: '근무자 삭제 완료' })
    fetchStaff()
    fetchWeekSchedule()
  }

  // ---------- 직원 추가 ----------
  const handleAddStaff = async () => {
    if (!newStaffName || !newStaffPhone) {
      toast({ title: '입력 오류', variant: 'destructive' })
      return
    }
    await api.post('/staff/add', {
      name: newStaffName,
      phone: newStaffPhone,
    })
    toast({ title: '직원 추가 완료' })
    setIsAddDialogOpen(false)
    fetchStaff()
  }

  // ---------- 대타 승인 ----------
  const handleApproveRecruit = async (id: string) => {
    await api.patch(`/sub/owner/approve/${id}`)
    toast({ title: '대타 모집 허가' })
    fetchSubRequests()
  }

  const handleFinalApprove = async (id: string) => {
    await api.patch(`/sub/owner/final/${id}`)
    toast({ title: '최종 승인 완료' })
    fetchSubRequests()
    fetchWeekSchedule()
  }

  // ================= 렌더 ================= //
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">근무자 / 근무표 관리</h1>

        {/* 직원 추가 다이얼로그 */}
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="w-4 h-4 mr-2" /> 근무자 추가
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>새 근무자 추가</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Label>이름</Label>
              <Input
                value={newStaffName}
                onChange={(e) => setNewStaffName(e.target.value)}
              />
              <Label>연락처</Label>
              <Input
                value={newStaffPhone}
                onChange={(e) => setNewStaffPhone(e.target.value)}
              />
              <Button className="w-full" onClick={handleAddStaff}>
                등록
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* 탭: 근무자 / 근무표 / 대타 */}
      <Tabs defaultValue="staff">
        <TabsList>
          <TabsTrigger value="staff">근무자</TabsTrigger>
          <TabsTrigger value="schedule">근무표</TabsTrigger>
          <TabsTrigger value="sub">대타</TabsTrigger>
        </TabsList>

        {/* 근무자 관리 */}
        <TabsContent value="staff">
          <Card>
            <CardHeader>
              <CardTitle>근무자 목록</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {staffList.map((s) => (
                <div
                  key={s._id}
                  className="flex justify-between border p-2 rounded"
                >
                  <div>
                    <p className="font-medium">{s.name}</p>
                    <p className="text-sm text-muted-foreground">{s.phone}</p>
                    <p className="text-xs text-muted-foreground">
                      ID: {s.username}
                    </p>
                  </div>

                  <Button
                    variant="destructive"
                    size="icon"
                    onClick={() => handleDeleteStaff(s._id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 근무표 */}
        <TabsContent value="schedule">
          <Card>
            <CardHeader>
              <CardTitle>이번 주 근무표</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* 등록 UI */}
              <div className="grid md:grid-cols-3 gap-3">
                <select
                  className="border p-2 rounded"
                  value={selectedStaff}
                  onChange={(e) => setSelectedStaff(e.target.value)}
                >
                  <option value="">선택</option>
                  {staffList.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                  <Input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                  />
                </div>
              </div>
              <Button className="w-full" onClick={handleAddSchedule}>
                등록
              </Button>

              {/* 주간 표시 */}
              <div className="grid lg:grid-cols-7 md:grid-cols-4 gap-3">
                {weekSchedule.map((day) => (
                  <div key={day.date} className="border p-2 rounded">
                    <p className="font-semibold text-center">{day.dayLabel}</p>

                    {day.shifts.map((shift) => (
                      <div
                        key={shift._id}
                        className="bg-muted/40 p-2 rounded mt-2"
                      >
                        <div className="flex justify-between text-xs">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {shift.startTime} - {shift.endTime}
                          </span>
                          <span className="text-[10px]">{shift.hours}h</span>
                        </div>

                        <p className="text-xs text-muted-foreground">
                          {shift.staffName}
                        </p>

                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-6 w-6"
                            onClick={() => openEditDialog(shift)}
                          >
                            <Edit2 className="w-3 h-3" />
                          </Button>
                          <Button
                            size="icon"
                            variant="destructive"
                            className="h-6 w-6"
                            onClick={() => handleDeleteSchedule(shift)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 대타 */}
        <TabsContent value="sub">
          <Card>
            <CardHeader>
              <CardTitle>대타 요청 관리</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* 진행 중 */}
              <div>
                <h4 className="font-semibold mb-2">진행 중 요청</h4>
                {pendingSubs.length === 0 ? (
                  <p>없음</p>
                ) : (
                  pendingSubs.map((r) => (
                    <div
                      key={r._id}
                      className="border p-2 rounded flex justify-between text-sm"
                    >
                      <div>
                        <p>
                          {r.scheduleId?.date?.split('T')[0]} / {r.scheduleId?.startTime}~{r.scheduleId?.endTime}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          요청자: {r.requesterName}
                        </p>
                        {r.substituteName && (
                          <p className="text-xs text-muted-foreground">
                            대타: {r.substituteName}
                          </p>
                        )}
                        <p className="text-[10px] text-muted-foreground">
                          상태: {getSubStatusLabel(r.status)}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {r.status === 'requested' && (
                          <Button
                            size="sm"
                            onClick={() => handleApproveRecruit(r._id)}
                          >
                            대타 모집
                          </Button>
                        )}
                        {r.status === 'accepted_by_sub' && (
                          <Button
                            size="sm"
                            onClick={() => handleFinalApprove(r._id)}
                          >
                            최종 승인
                          </Button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* 승인 완료 */}
              <div>
                <h4 className="font-semibold mb-2">승인 완료</h4>
                {approvedSubs.length === 0 ? (
                  <p>없음</p>
                ) : (
                  approvedSubs.map((r) => (
                    <div
                      key={r._id}
                      className="border p-2 rounded flex justify-between text-sm"
                    >
                      <div>
                        <p>
                          {r.scheduleId?.date?.split('T')[0]} / {r.scheduleId?.startTime}~{r.scheduleId?.endTime}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          요청자: {r.requesterName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          대타: {r.substituteName ?? '-'}
                        </p>
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        완료
                      </span>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* 스케줄 수정 다이얼로그 */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>근무표 수정</DialogTitle>
          </DialogHeader>

          {editTarget && (
            <div className="space-y-3">
              <Label>날짜</Label>
              <Input
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
              />

              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="time"
                  value={editStartTime}
                  onChange={(e) => setEditStartTime(e.target.value)}
                />
                <Input
                  type="time"
                  value={editEndTime}
                  onChange={(e) => setEditEndTime(e.target.value)}
                />
              </div>

              <Button className="w-full" onClick={handleUpdateSchedule}>
                저장
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default StaffManagement
