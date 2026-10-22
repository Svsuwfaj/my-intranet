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
    // 유저 테이블
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        name TEXT,
        rank TEXT DEFAULT '아이언',
        category TEXT DEFAULT '일반직'
    )`);

    // 출퇴근 기록 테이블 (status_note 추가)
    db.run(`CREATE TABLE IF NOT EXISTS attendance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT,
        name TEXT,
        rank TEXT,
        category TEXT,
        clock_in DATETIME,
        clock_out DATETIME,
        date TEXT,
        total_seconds INTEGER DEFAULT 0,
        status_note TEXT DEFAULT ''
    )`);

    // 공지사항 테이블
    db.run(`CREATE TABLE IF NOT EXISTS notices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        content TEXT,
        author TEXT,
        date TEXT
    )`);

    // 기본 관리자 계정만 생성
    const stmt = db.prepare(`INSERT OR IGNORE INTO users (username, password, name, rank, category) VALUES (?, '1234', ?, ?, ?)`);
    stmt.run(['admin', '관리자', '레디언트', '최고위직']);
    stmt.finalize();
});

// 메인 라우트
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'), (err) => {
        if (err) res.sendFile(path.join(__dirname, 'index.html'));
    });
});

// 회원가입 API
app.post('/api/register', (req, res) => {
    const { username, password, name } = req.body;
    if (!username || !password || !name) {
        return res.json({ success: false, message: '모든 항목을 입력해주세요.' });
    }

    db.run(`INSERT INTO users (username, password, name, rank, category) VALUES (?, ?, ?, '아이언', '일반직')`,
        [username, password, name],
        function (err) {
            if (err) {
                if (err.message.includes('UNIQUE')) {
                    return res.json({ success: false, message: '이미 존재하는 아이디입니다.' });
                }
                return res.json({ success: false, message: '회원가입 처리 중 오류가 발생했습니다.' });
            }
            res.json({ success: true, message: '회원가입이 완료되었습니다! 로그인 해주세요.' });
        }
    );
});

// 로그인 API
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM users WHERE username = ? AND password = ?`, [username, password], (err, row) => {
        if (err || !row) return res.json({ success: false, message: '아이디 또는 비밀번호가 올바르지 않습니다.' });
        res.json({ success: true, user: { username: row.username, name: row.name, rank: row.rank, category: row.category } });
    });
});

// 출근 API (상태 메시지 기능 추가)
app.post('/api/clock-in', (req, res) => {
    const { username, name, rank, category, status_note } = req.body;
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];

    db.get(`SELECT * FROM attendance WHERE username = ? AND clock_out IS NULL`, [username], (err, row) => {
        if (row) return res.json({ success: false, message: '이미 작전 수행(출근) 중입니다.' });

        db.run(`INSERT INTO attendance (username, name, rank, category, clock_in, date, status_note) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [username, name, rank, category, now.toISOString(), dateStr, status_note || ''],
            function (err) {
                if (err) return res.status(500).json({ success: false, message: '출근 등록 실패' });
                res.json({ success: true, message: `[${rank}] ${name} 요원, 작전에 배치되었습니다!` });
            }
        );
    });
});

// 퇴근 API
app.post('/api/clock-out', (req, res) => {
    const { username } = req.body;
    const now = new Date();

    db.get(`SELECT * FROM attendance WHERE username = ? AND clock_out IS NULL`, [username], (err, row) => {
        if (!row) return res.json({ success: false, message: '현재 복귀 대기 중인 출근 기록이 없습니다.' });

        const inTime = new Date(row.clock_in);
        const diffSec = Math.floor((now - inTime) / 1000);

        db.run(`UPDATE attendance SET clock_out = ?, total_seconds = ? WHERE id = ?`,
            [now.toISOString(), diffSec, row.id],
            function (err) {
                if (err) return res.status(500).json({ success: false });
                res.json({ success: true, message: '작전 복귀(퇴근)가 완료되었습니다.' });
            }
        );
    });
});

// 출근부 데이터 및 통계 API
app.get('/api/attendance-data', (req, res) => {
    db.all(`SELECT * FROM attendance ORDER BY clock_in DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ success: false });
        
        db.all(`SELECT COUNT(*) as total FROM users`, [], (err, userCountRow) => {
            const totalMembers = userCountRow[0]?.total || 1;
            const todayStr = new Date().toISOString().split('T')[0];
            const todayWorkingSet = new Set();
            
            rows.forEach(r => {
                if (r.date === todayStr) todayWorkingSet.add(r.username);
            });

            const workingCount = todayWorkingSet.size;
            const attendanceRate = totalMembers > 0 ? ((workingCount / totalMembers) * 100).toFixed(1) : 0;

            res.json({
                success: true,
                list: rows,
                stats: { totalMembers, workingCount, attendanceRate }
            });
        });
    });
});

// 작전 브리핑(공지) 목록
app.get('/api/notices', (req, res) => {
    db.all(`SELECT * FROM notices ORDER BY id DESC`, [], (err, rows) => {
        res.json({ success: true, list: rows });
    });
});

// 작전 브리핑(공지) 등록
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

// 유저 목록 조회
app.get('/api/users', (req, res) => {
    db.all(`SELECT username, name, rank, category FROM users`, [], (err, rows) => {
        res.json({ success: true, list: rows });
    });
});

// 관리자 직접 인원 추가 API
app.post('/api/admin-add-user', (req, res) => {
    const { username, password, name, rank, category } = req.body;
    if (!username || !password || !name) {
        return res.json({ success: false, message: '필수 정보를 모두 입력하세요.' });
    }

    db.run(`INSERT INTO users (username, password, name, rank, category) VALUES (?, ?, ?, ?, ?)`,
        [username, password, name, rank || '아이언', category || '일반직'],
        function (err) {
            if (err) return res.json({ success: false, message: '유저 등록 실패 (중복된 아이디일 수 있습니다).' });
            res.json({ success: true, message: `[${rank}] ${name} 요원이 등록되었습니다.` });
        }
    );
});

// 관리자 요원 삭제 API
app.post('/api/admin-delete-user', (req, res) => {
    const { username } = req.body;
    if (username === 'admin') {
        return res.json({ success: false, message: '기본 메인 관리자 계정은 삭제할 수 없습니다.' });
    }
    db.run(`DELETE FROM users WHERE username = ?`, [username], function (err) {
        if (err) return res.json({ success: false, message: '삭제 실패' });
        res.json({ success: true, message: '해당 요원이 명단에서 삭제되었습니다.' });
    });
});

// 티어 조정 API
app.post('/api/update-rank', (req, res) => {
    const { username, newRank, newCategory } = req.body;
    db.run(`UPDATE users SET rank = ?, category = ? WHERE username = ?`, [newRank, newCategory, username], function (err) {
        if (err) return res.json({ success: false, message: '티어 변경 실패' });
        res.json({ success: true, message: '티어가 성공적으로 변동되었습니다.' });
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
    console.log(`Valorant Intranet server running on port ${PORT}`);
});