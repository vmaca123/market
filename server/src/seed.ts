import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import dotenv from 'dotenv'
import User from './models/User'

dotenv.config()

const seedUsers = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI!)
    console.log('MongoDB Connected')

    // 기존 사용자 삭제
    await User.deleteMany({})

    // 비밀번호 해싱
    const hashedPassword = await bcrypt.hash('1234', 10)

    // 테스트 사용자 생성
    const users = [
      {
        username: 'owner',
        password: hashedPassword,
        rawPassword: '1234',
        role: 'owner',
        name: '점주',
        phone: '010-1234-5678',
        joinDate: new Date(),
        status: '활성',
      },
      {
        username: 'staff',
        password: hashedPassword,
        rawPassword: '1234',
        role: 'staff',
        name: '직원',
        phone: '010-9876-5432',
        joinDate: new Date(),
        status: '활성',
      },
    ]

    await User.insertMany(users)
    console.log('✅ 사용자 생성 완료!')
    console.log('Owner 계정: username=owner, password=1234')
    console.log('Staff 계정: username=staff, password=1234')

    process.exit(0)
  } catch (error) {
    console.error('❌ 에러:', error)
    process.exit(1)
  }
}

seedUsers()
