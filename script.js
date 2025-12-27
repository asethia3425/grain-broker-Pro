import { auth } from './firebase-config.js';
import { 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    onAuthStateChanged, 
    signOut 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// --- DYNAMIC DATA ---
const appData = [
    {
        id: "math", name: "Mathematics", chapters: [
            { id: "m1", title: "Algebra Basics", questions: [
                { q: "Solve: 5x = 25", options: ["x=2", "x=5", "x=10", "x=25"], correct: 1, explanation: "Divide both sides by 5. 25/5 = 5." }
            ]},
            { id: "m2", title: "Geometry", questions: [
                { q: "Sum of angles in a triangle?", options: ["90°", "180°", "270°", "360°"], correct: 1, explanation: "The sum of all interior angles in any triangle is always 180°." }
            ]}
        ]
    },
    {
        id: "sci", name: "Science", chapters: [
            { id: "s1", title: "Physics: Light", questions: [
                { q: "Speed of light is approx?", options: ["300,000 km/s", "150,000 km/s", "1,000 km/s", "30,000 km/s"], correct: 0, explanation: "Light travels at approximately 299,792,458 meters per second." }
            ]}
        ]
    }
];

// --- STATE ---
let currentQuestions = [];
let currentIdx = 0;

// --- DOM ELEMENTS ---
const root = document.getElementById('app-root');
const breadcrumb = document.getElementById('breadcrumb');

// --- AUTH LOGIC ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        document.getElementById('auth-container').classList.add('hidden');
        document.getElementById('main-app').classList.remove('hidden');
        document.getElementById('user-email').innerText = user.email;
        renderSubjects();
    } else {
        document.getElementById('auth-container').classList.remove('hidden');
        document.getElementById('main-app').classList.add('hidden');
    }
});

window.handleLogin = async () => {
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-password').value;
    try { await signInWithEmailAndPassword(auth, email, pass); } catch (e) { alert(e.message); }
};

window.handleSignUp = async () => {
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-password').value;
    try { await createUserWithEmailAndPassword(auth, email, pass); } catch (e) { alert(e.message); }
};

window.handleLogout = () => signOut(auth);

// --- NAVIGATION & RENDERING ---
window.renderSubjects = () => {
    breadcrumb.innerText = "Home";
    root.innerHTML = '<h2>Choose a Subject</h2>' + appData.map(s => `
        <div class="card subject-card" onclick="renderChapters('${s.id}')">
            <h3>${s.name}</h3>
            <p>${s.chapters.length} Chapters available</p>
        </div>
    `).join('');
};

window.renderChapters = (subjectId) => {
    const subject = appData.find(s => s.id === subjectId);
    breadcrumb.innerText = `Home > ${subject.name}`;
    root.innerHTML = `<h2>${subject.name} Chapters</h2>` + subject.chapters.map(c => `
        <div class="card chapter-card" onclick="startQuiz('${subjectId}', '${c.id}')">
            <h3>${c.title}</h3>
            <p>${c.questions.length} Questions</p>
        </div>
    `).join('');
};

window.startQuiz = (subId, chapId) => {
    const subject = appData.find(s => s.id === subId);
    const chapter = subject.chapters.find(c => c.id === chapId);
    breadcrumb.innerText = `Home > ${subject.name} > ${chapter.title}`;
    currentQuestions = chapter.questions;
    currentIdx = 0;
    showQuestion();
};

function showQuestion() {
    const q = currentQuestions[currentIdx];
    root.innerHTML = `
        <div class="card">
            <small>Question ${currentIdx + 1} of ${currentQuestions.length}</small>
            <h3>${q.q}</h3>
            ${q.options.map((opt, i) => `
                <button class="option-btn" onclick="checkAnswer(${i}, ${q.correct})">${opt}</button>
            `).join('')}
            <div id="exp-box" class="explanation hidden">
                <strong>Correct Answer & Explanation:</strong><br>${q.explanation}
                <button class="btn-primary" style="margin-top:15px" onclick="nextQuestion()">Continue</button>
            </div>
        </div>
    `;
}

window.checkAnswer = (selected, correct) => {
    const btns = document.querySelectorAll('.option-btn');
    btns.forEach((b, i) => {
        b.disabled = true;
        if (i === correct) b.classList.add('correct');
        else if (i === selected) b.classList.add('incorrect');
    });
    document.getElementById('exp-box').classList.remove('hidden');
};

window.nextQuestion = () => {
    currentIdx++;
    if (currentIdx < currentQuestions.length) showQuestion();
    else {
        root.innerHTML = `<div class="card"><h2>Chapter Completed!</h2><button class="btn-primary" onclick="renderSubjects()">Back to Home</button></div>`;
    }
};