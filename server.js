// 메인 페이지 접속 시 index.html 보답하기
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'), (err) => {
        if (err) {
            // 만약 public 폴더 안에 없을 경우 루트 폴더의 index.html 찾기
            res.sendFile(path.join(__dirname, 'index.html'));
        }
    });
});
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// SQLite DB 연결 및 테이블 생성
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) console.error('DB 연결 실패:', err.message);
    else console.log('SQLite DB 연결 성공');
});

db.serialize(() => {
    // 사용자 테이블 (아이디, 비밀번호, 이름, 직급, 분류)
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
        date TEXT
    )`);

    // 사쿠라 조직 초기 명단 자동 등록
    const initialMembers = [
        // 최고위직
        { username: 'pingpong', name: '핑퐁', rank: '화경앵', category: '최고위직' },
        { username: 'kangsangsik', name: '강상식', rank: '천본앵', category: '최고위직' },
        
        // 간부직
        { username: 'hanjuho', name: '한주호', rank: '화개', category: '간부직' },
        { username: 'luci', name: '르시', rank: '화개', category: '간부직' },
        { username: 'seodanhee', name: '서단희', rank: '화개', category: '간부직' },

        // 일반직
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
        
        // 일반직 (낙화-수습)
        { username: 'gilpanseo', name: '길판서', rank: '낙화(수습)', category: '일반직' },
        { username: 'yarkeung', name: '야르킁', rank: '낙화(수습)', category: '일반직' },
        { username: 'ppodori', name: '뽀돌이', rank: '낙화(수습)', category: '일반직' },
        { username: 'seongnim', name: '성님', rank: '낙화(수습)', category: '일반직' },
        { username: 'sinddonggu', name: '신똥구', rank: '낙화(수습)', category: '일반직' },
        { username: 'dongmin', name: '동민', rank: '낙화(수습)', category: '일반직' },
        { username: 'jeongjinwoo', name: '정진우', rank: '낙화(수습)', category: '일반직' },
        { username: 'kimgaeng', name: '김갱', rank: '낙화(수습)', category: '일반직' },

        // 특수직
        { username: 'hihit', name: '히힛', rank: '유화', category: '특수직' },
        { username: 'heukbaek', name: '흑백', rank: '유화', category: '특수직' },

        // 관리자용 기본 테스트 계정
        { username: 'admin', name: '관리자', rank: '화경앵', category: '최고위직' }
    ];

    const stmt = db.prepare(`INSERT OR IGNORE INTO users (username, password, name, rank, category) VALUES (?, '1234', ?, ?, ?)`);
    initialMembers.forEach(m => {
        stmt.run([m.username, m.name, m.rank, m.category]);
    });
    stmt.finalize();
});

// 로그인 API
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM users WHERE username = ? AND password = ?`, [username, password], (err, row) => {
        if (err) return res.status(500).json({ success: false, message: 'DB 에러가 발생했습니다.' });
        if (row) {
            res.json({ success: true, user: { username: row.username, name: row.name, rank: row.rank, category: row.category } });
        } else {
            res.json({ success: false, message: '아이디 또는 비밀번호가 올바르지 않습니다.' });
        }
    });
});

// 출근 등록 API
app.post('/api/clock-in', (req, res) => {
    const { username, name, rank, category } = req.body;
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];

    db.get(`SELECT * FROM attendance WHERE username = ? AND clock_out IS NULL`, [username], (err, row) => {
        if (row) return res.json({ success: false, message: '이미 출근 처리되어 있는 상태입니다.' });

        db.run(`INSERT INTO attendance (username, name, rank, category, clock_in, date) VALUES (?, ?, ?, ?, ?, ?)`,
            [username, name, rank, category, now.toISOString(), dateStr],
            function (err) {
                if (err) return res.status(500).json({ success: false, message: '출근 등록 실패' });
                res.json({ success: true, message: `[${rank}] ${name}님, 출근 완료되었습니다!` });
            }
        );
    });
});

// 퇴근 등록 API
app.post('/api/clock-out', (req, res) => {
    const { username } = req.body;
    const now = new Date().toISOString();

    db.run(`UPDATE attendance SET clock_out = ? WHERE username = ? AND clock_out IS NULL`,
        [now, username],
        function (err) {
            if (err || this.changes === 0) return res.json({ success: false, message: '현재 출근 중인 기록이 없습니다.' });
            res.json({ success: true, message: '퇴근 처리되었습니다. 고생 많으셨습니다!' });
        }
    );
});

// 출근부 조회 API
app.get('/api/attendance-list', (req, res) => {
    db.all(`SELECT * FROM attendance ORDER BY clock_in DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true, list: rows });
    });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});