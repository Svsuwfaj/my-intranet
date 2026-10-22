const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// SQLite DB 연결
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) console.error('DB 연결 실패:', err.message);
    else console.log('SQLite DB 연결 성공');
});

db.serialize(() => {
    // 사용자 테이블
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        name TEXT,
        rank TEXT,
        category TEXT
    )`);

    // 출퇴근 기록 테이블
    db.run(`CREATE TABLE IF NOT EXISTS attendance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT,
        name TEXT,
        rank TEXT,
        category TEXT,
        clock_in DATETIME,
        clock_out DATETIME,
        date TEXT,
        total_seconds INTEGER DEFAULT 0
    )`);

    // 공지사항 테이블
    db.run(`CREATE TABLE IF NOT EXISTS notices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        content TEXT,
        author TEXT,
        date TEXT
    )`);

    // 초기 멤버 시드 데이터 삽입
    const initialMembers = [
        { username: 'pingpong', name: '핑퐁', rank: '화경앵', category: '최고위직' },
        { username: 'kangsangsik', name: '강상식', rank: '천본앵', category: '최고위직' },
        { username: 'hanjuho', name: '한주호', rank: '화개', category: '간부직' },
        { username: 'luci', name: '르시', rank: '화개', category: '간부직' },
        { username: 'seodanhee', name: '서단희', rank: '화개', category: '간부직' },
        { username: 'seonggeun', name: '성근', rank: '성개', category: '일반직' },
        { username: 'seojihun', name: '서지훈', rank: '반개', category: '일반직' },
        { username: 'isea', name: '이세아', rank: '만소', category: '일반직' },
        { username: 'radae', name: '라대', rank: '만소', category: '일반직' },
        { username: 'hanjeongheun', name: '한정흔', rank: '만소', category: '일반직' },
        { username: 'gami', name: '감이', rank: '만소', category: '일반직' },
        { username: 'meonggu', name: '멍구', rank: '만소', category: '일반직' },
        { username: 'habaek', name: '하백', rank: '만소', category: '일반직' },
        { username: 'kyoboss', name: '쿄사장', rank: '만소', category: '일반직' },
        { username: 'doma', name: '도마', rank: '만소', category: '일반직' },
        { username: 'heokbun', name: '흑분', rank: '만소', category: '일반직' },
        { username: 'baekgu', name: '백색애완백구', rank: '만소', category: '일반직' },
        { username: 'gilpanseo', name: '길판서', rank: '낙화(수습)', category: '일반직' },
        { username: 'yarkeung', name: '야르킁', rank: '낙화(수습)', category: '일반직' },
        { username: 'ppodori', name: '뽀돌이', rank: '낙화(수습)', category: '일반직' },
        { username: 'seongnim', name: '성님', rank: '낙화(수습)', category: '일반직' },
        { username: 'sinddonggu', name: '신똥구', rank: '낙화(수습)', category: '일반직' },
        { username: 'dongmin', name: '동민', rank: '낙화(수습)', category: '일반직' },
        { username: 'jeongjinwoo', name: '정진우', rank: '낙화(수습)', category: '일반직' },
        { username: 'kimgaeng', name: '김갱', rank: '낙화(수습)', category: '일반직' },
        { username: 'hihit', name: '히힛', rank: '유화', category: '특수직' },
        { username: 'heukbaek', name: '흑백', rank: '유화', category: '특수직' },
        { username: 'admin', name: '관리자', rank: '화경앵', category: '최고위직' }
    ];

    const stmt = db.prepare(`INSERT OR IGNORE INTO users (username, password, name, rank, category) VALUES (?, '1234', ?, ?, ?)`);
    initialMembers.forEach(m => stmt.run([m.username, m.name, m.rank, m.category]));
    stmt.finalize();
});

// 메인 페이지 라우트
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 로그인 API
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM users WHERE username = ? AND password = ?`, [username, password], (err, row) => {
        if (err || !row) return res.json({ success: false, message: '아이디 또는 비밀번호가 올바르지 않습니다.' });
        res.json({ success: true, user: { username: row.username, name: row.name, rank: row.rank, category: row.category } });
    });
});

// 출근 API
app.post('/api/clock-in', (req, res) => {
    const { username, name, rank, category } = req.body;
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];

    db.get(`SELECT * FROM attendance WHERE username = ? AND clock_out IS NULL`, [username], (err, row) => {
        if (row) return res.json({ success: false, message: '이미 출근 중인 상태입니다.' });

        db.run(`INSERT INTO attendance (username, name, rank, category, clock_in, date) VALUES (?, ?, ?, ?, ?, ?)`,
            [username, name, rank, category, now.toISOString(), dateStr],
            function (err) {
                if (err) return res.status(500).json({ success: false, message: '출근 등록 실패' });
                res.json({ success: true, message: `[${rank}] ${name}님, 출근 완료!` });
            }
        );
    });
});

// 퇴근 API
app.post('/api/clock-out', (req, res) => {
    const { username } = req.body;
    const now = new Date();

    db.get(`SELECT * FROM attendance WHERE username = ? AND clock_out IS NULL`, [username], (err, row) => {
        if (!row) return res.json({ success: false, message: '출근 기록을 찾을 수 없습니다.' });

        const inTime = new Date(row.clock_in);
        const diffSec = Math.floor((now - inTime) / 1000);

        db.run(`UPDATE attendance SET clock_out = ?, total_seconds = ? WHERE id = ?`,
            [now.toISOString(), diffSec, row.id],
            function (err) {
                if (err) return res.status(500).json({ success: false });
                res.json({ success: true, message: '퇴근 처리되었습니다.' });
            }
        );
    });
});

// 출근부 및 통계 조회 API
app.get('/api/attendance-data', (req, res) => {
    db.all(`SELECT * FROM attendance ORDER BY clock_in DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ success: false });
        
        db.all(`SELECT COUNT(*) as total FROM users`, [], (err, userCountRow) => {
            const totalMembers = userCountRow[0]?.total || 27;
            
            // 오늘 날짜 기준 출근한 고유 인원 수 계산
            const todayStr = new Date().toISOString().split('T')[0];
            const todayWorkingSet = new Set();
            rows.forEach(r => {
                if (r.date === todayStr) todayWorkingSet.add(r.username);
            });

            const workingCount = todayWorkingSet.size;
            const attendanceRate = ((workingCount / totalMembers) * 100).toFixed(1);

            res.json({
                success: true,
                list: rows,
                stats: {
                    totalMembers,
                    workingCount,
                    attendanceRate
                }
            });
        });
    });
});

// 공지사항 조회 API
app.get('/api/notices', (req, res) => {
    db.all(`SELECT * FROM notices ORDER BY id DESC`, [], (err, rows) => {
        res.json({ success: true, list: rows });
    });
});

// 공지사항 등록 API
app.post('/api/notices', (req, res) => {
    const { title, content, author } = req.body;
    const dateStr = new Date().toISOString().split('T')[0];
    db.run(`INSERT INTO notices (title, content, author, date) VALUES (?, ?, ?, ?)`,
        [title, content, author, dateStr],
        function (err) {
            if (err) return res.json({ success: false });
            res.json({ success: true });
        }
    );
});

// 전체 유저 목록 (직급 관리용)
app.get('/api/users', (req, res) => {
    db.all(`SELECT username, name, rank, category FROM users`, [], (err, rows) => {
        res.json({ success: true, list: rows });
    });
});

// 직급 변경 (진급/조정) API (최고위직 전용)
app.post('/api/update-rank', (req, res) => {
    const { username, newRank, newCategory } = req.body;
    db.run(`UPDATE users SET rank = ?, category = ? WHERE username = ?`, [newRank, newCategory, username], function (err) {
        if (err) return res.json({ success: false, message: '직급 변경 실패' });
        res.json({ success: true, message: '직급이 성공적으로 변경되었습니다.' });
    });
});

// 비밀번호 변경 API
app.post('/api/change-password', (req, res) => {
    const { username, currentPassword, newPassword } = req.body;
    db.get(`SELECT * FROM users WHERE username = ? AND password = ?`, [username, currentPassword], (err, row) => {
        if (!row) return res.json({ success: false, message: '현재 비밀번호가 일치하지 않습니다.' });

        db.run(`UPDATE users SET password = ? WHERE username = ?`, [newPassword, username], function (err) {
            if (err) return res.json({ success: false, message: '변경 실패' });
            res.json({ success: true, message: '비밀번호가 변경되었습니다.' });
        });
    });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});