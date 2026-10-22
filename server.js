const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// SQLite DB 연결
const db = new sqlite3.Database(path.join(__dirname, 'database.sqlite'), (err) => {
  if (err) {
    console.error('DB 연결 에러:', err.message);
  } else {
    console.log('✅ SQLite 데이터베이스 연결 완료!');
  }
});

// 테이블 및 기본 관리자 생성
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS intranet_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    char_name TEXT NOT NULL,
    department TEXT NOT NULL,
    grade TEXT NOT NULL,
    is_duty INTEGER DEFAULT 0,
    role TEXT DEFAULT 'member'
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS intranet_notices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    author TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`INSERT OR IGNORE INTO intranet_members (username, password, char_name, department, grade, role) 
          VALUES ('admin', '1234', '총관리자', '본부', '국장', 'admin')`);
});

app.get('/health', (req, res) => res.status(200).send('OK'));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 로그인 API
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  db.get('SELECT * FROM intranet_members WHERE username = ? AND password = ?', [username, password], (err, user) => {
    if (err) return res.status(500).json({ success: false, message: '서버 에러' });
    if (user) {
      res.json({
        success: true,
        user: { id: user.id, name: user.char_name, dept: user.department, grade: user.grade, isDuty: user.is_duty, role: user.role }
      });
    } else {
      res.status(401).json({ success: false, message: '아이디 또는 비밀번호가 일치하지 않습니다.' });
    }
  });
});

// 계정 생성 API
app.post('/api/members/create', (req, res) => {
  const { username, password, char_name, department, grade, role } = req.body;
  db.run('INSERT INTO intranet_members (username, password, char_name, department, grade, role) VALUES (?, ?, ?, ?, ?, ?)',
    [username, password, char_name, department, grade, role || 'member'],
    function (err) {
      if (err) return res.status(500).json({ success: false, message: '이미 존재하는 아이디이거나 생성 실패' });
      res.json({ success: true, message: '계정 생성 완료' });
    }
  );
});

// 출퇴근 변경 API
app.post('/api/duty/toggle', (req, res) => {
  const { userId, isDuty } = req.body;
  db.run('UPDATE intranet_members SET is_duty = ? WHERE id = ?', [isDuty, userId], (err) => {
    if (err) return res.status(500).json({ success: false, message: '변경 실패' });
    res.json({ success: true, isDuty });
  });
});

// 대시보드 API
app.get('/api/dashboard', (req, res) => {
  db.all('SELECT char_name, grade, department FROM intranet_members WHERE is_duty = 1', [], (err, dutyList) => {
    db.get('SELECT COUNT(*) as total, SUM(is_duty) as working FROM intranet_members', [], (err, counts) => {
      const totalCount = counts?.total || 1;
      const workingCount = counts?.working || 0;
      const dutyRate = Math.round((workingCount / totalCount) * 100);

      db.all('SELECT * FROM intranet_notices ORDER BY id DESC LIMIT 5', [], (err, notices) => {
        res.json({
          success: true,
          onDutyCount: (dutyList || []).length,
          onDutyList: dutyList || [],
          totalMembers: totalCount,
          dutyRate: dutyRate,
          notices: notices || []
        });
      });
    });
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});