// 1. Состояние приложения (State)
let activeClinicalCase = null;
let currentStepIdx = 0;
let isAnimating = false;
let isSanitized = false;
let isRobed = false;
const expectedSequence = ['pha', 'inc', 'col', 'spin', 'kcl', 'fix', 'drop', 'trypsin', 'micro'];
const labErrors = {
    'kcl_before_colchicine': {
        title: 'Нарушение метафазы',
        desc: 'Вы пытаетесь добавить гипотоник (KCl) без остановки деления.',
        theory: 'Без колхицина клетки продолжат делиться, и вы не получите стабильных метафазных пластинок. Сначала нужно разрушить веретено деления.'
    },
    'fix_before_kcl': {
        title: 'Ошибка осмоса',
        desc: 'Фиксатор добавлен до гипотонического раствора!',
        theory: 'Фиксатор Карнуа мгновенно денатурирует белки и делает мембрану жесткой. Если клетки не набухли в KCl заранее, хромосомы останутся в тесном комке, и их нельзя будет проанализировать.'
    },
    'giemsa_before_trypsin': {
        title: 'Проблема бэндинга',
        desc: 'Окраска Гимза наносится на неподготовленные хромосомы.',
        theory: 'Без предварительной обработки трипсином краситель ляжет ровным слоем. Мы не увидим специфический рисунок светлых и темных полос (G-полос), необходимый для идентификации хромосом.'
    },
    'generic_wrong': {
        title: 'Нарушение протокола',
        desc: 'Выбранный реагент не подходит для данного этапа.',
        theory: 'Цитогенетический анализ требует строгой последовательности: Культивирование -> Остановка деления -> Гипотония -> Фиксация -> Раскатка -> Окраска.'
    }
};

// 2. Навигация
function switchScreen(screenId) {
    document.querySelectorAll('.app-screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(screenId);
    if (target) target.classList.add('active');

    // Инициализируем drag-and-drop при входе в лабораторию
    if (screenId === 'app-lab') setTimeout(initLabDragDrop, 100);
    if (screenId === 'app-fish-lab') setTimeout(initFishDragDrop, 100);
}

// ===== DRAG AND DROP: Цитогенетическая Лаборатория =====
function initLabDragDrop() {
    const dropZone = document.getElementById('drop-zone');
    if (!dropZone || dropZone._dndReady) return;
    dropZone._dndReady = true;

    document.querySelectorAll('[data-action]').forEach(el => {
        el.addEventListener('dragstart', e => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('lab-action', el.dataset.action);
            // Клон для красивого ghost-изображения
            setTimeout(() => el.classList.add('is-dragging'), 0);
            dropZone.classList.add('drop-ready');
        });
        el.addEventListener('dragend', () => {
            el.classList.remove('is-dragging');
            dropZone.classList.remove('drop-ready', 'drop-hover');
        });
    });

    dropZone.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        dropZone.classList.add('drop-hover');
    });
    dropZone.addEventListener('dragleave', e => {
        // Проверяем, что действительно покинули зону, а не дочерний элемент
        if (!dropZone.contains(e.relatedTarget)) {
            dropZone.classList.remove('drop-hover');
        }
    });
    dropZone.addEventListener('drop', e => {
        e.preventDefault();
        const action = e.dataTransfer.getData('lab-action');
        const sourceEl = document.querySelector(`[data-action="${action}"]`);
        dropZone.classList.remove('drop-hover', 'drop-ready');
        if (action && sourceEl) {
            // Анимация «выливания» реагента
            spawnPourParticle(sourceEl, dropZone);
            setTimeout(() => labProcess(action, sourceEl), 200);
        }
    });
}

// ===== DRAG AND DROP: FISH Лаборатория =====
function initFishDragDrop() {
    const dropZone = document.getElementById('fish-drop-zone');
    if (!dropZone || dropZone._dndReady) return;
    dropZone._dndReady = true;

    document.querySelectorAll('[data-fish-action]').forEach(el => {
        el.addEventListener('dragstart', e => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('fish-action', el.dataset.fishAction);
            setTimeout(() => el.classList.add('is-dragging'), 0);
            dropZone.classList.add('drop-ready');
        });
        el.addEventListener('dragend', () => {
            el.classList.remove('is-dragging');
            dropZone.classList.remove('drop-ready', 'drop-hover');
        });
    });

    dropZone.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        dropZone.classList.add('drop-hover');
    });
    dropZone.addEventListener('dragleave', e => {
        if (!dropZone.contains(e.relatedTarget)) {
            dropZone.classList.remove('drop-hover');
        }
    });
    dropZone.addEventListener('drop', e => {
        e.preventDefault();
        const action = e.dataTransfer.getData('fish-action');
        const sourceEl = document.querySelector(`[data-fish-action="${action}"]`);
        dropZone.classList.remove('drop-hover', 'drop-ready');
        if (action && sourceEl) {
            spawnPourParticle(sourceEl, dropZone);
            setTimeout(() => fishLabProcess(action, sourceEl), 200);
        }
    });
}

// Визуальный эффект: частица летит от реагента к зоне дропа
function spawnPourParticle(fromEl, toZone) {
    const fromRect = fromEl.getBoundingClientRect();
    const toRect = toZone.getBoundingClientRect();

    const dot = document.createElement('div');
    dot.style.cssText = `
        position: fixed;
        width: 10px; height: 10px;
        border-radius: 50%;
        background: rgba(255,255,255,0.85);
        box-shadow: 0 0 12px rgba(255,255,255,0.7);
        pointer-events: none;
        z-index: 9999;
        left: ${fromRect.left + fromRect.width / 2 - 5}px;
        top: ${fromRect.top + fromRect.height / 2 - 5}px;
        transition: left 0.3s ease-out, top 0.3s ease-out, opacity 0.3s ease-out, transform 0.3s ease-out;
    `;
    document.body.appendChild(dot);
    requestAnimationFrame(() => {
        dot.style.left = `${toRect.left + toRect.width / 2 - 5}px`;
        dot.style.top = `${toRect.top + toRect.height / 2 - 5}px`;
        dot.style.opacity = '0';
        dot.style.transform = 'scale(2.5)';
    });
    setTimeout(() => dot.remove(), 400);
}

// 3. Запуск и выбор кейса
function startApp() {
    // Скрываем лендинг
    const landing = document.getElementById('landing-page');
    if (landing) landing.style.display = 'none';

    // Выбираем рандомный кейс
    activeClinicalCase = clinicalCases[Math.floor(Math.random() * clinicalCases.length)];
    
    populateCase(activeClinicalCase);
    switchScreen('app-case');
}

function populateCase(caseData) {
    document.getElementById('case-patient-info').innerHTML = caseData.patient;
    document.getElementById('case-error').classList.add('hidden');
    document.querySelectorAll('#diagnostic-options .choice-card').forEach(el => el.classList.remove('wrong'));
}

// 4. Логика СИЗ (Антисептик -> Перчатки)
function prepAction(item) {
    const err = document.getElementById('prep-error');
    const hint = document.getElementById('prep-hint');

    // Сброс ошибки при каждом клике
    err.textContent = '';

    if (item === 'robe') {
        isRobed = true;
        document.getElementById('prep-robe').style.filter = 'drop-shadow(0 0 15px rgba(59,130,246,0.8))';
        hint.textContent = 'Отлично! Теперь обработайте руки антисептиком';
        hint.className = 'text-green-400 font-bold mono bg-green-900/30 px-4 py-1 rounded-full text-xs';
        
    } else if (item === 'sanitizer') {
        if (!isRobed) {
            err.textContent = 'Ошибка! Сначала нужно надеть халат.';
        } else {
            isSanitized = true;
            document.getElementById('prep-sanitizer').style.filter = 'drop-shadow(0 0 15px rgba(59,130,246,0.8))';
            hint.textContent = 'Правило: Теперь наденьте перчатки';
        }

    } else if (item === 'gloves') {
        if (!isRobed) {
            err.textContent = 'Ошибка! Сначала нужно надеть халат.';
        } else if (!isSanitized) {
            err.textContent = 'Ошибка! Сначала необходимо обработать руки антисептиком.';
        } else {
            document.getElementById('prep-gloves').style.filter = 'drop-shadow(0 0 15px rgba(59,130,246,0.8))';
            // Небольшая задержка перед переходом, чтобы игрок увидел свечение перчаток
            setTimeout(() => switchScreen('app-lab'), 1000);
        }
    }
}

// 5. Лабораторный процесс — основная реализация ниже
function setLabHint(text, type) {
    const hint = document.getElementById('lab-hint');
    hint.textContent = text;
    if (type === 'error') {
        hint.className = 'text-red-400 font-bold uppercase mono tracking-widest text-xs bg-red-900/50 px-4 py-1 rounded-full transition-colors duration-300';
    } else if (type === 'success') {
        hint.className = 'text-green-400 font-bold uppercase mono tracking-widest text-xs bg-green-900/50 px-4 py-1 rounded-full transition-colors duration-300';
    } else {
        hint.className = 'text-slate-400 font-bold uppercase mono tracking-widest text-xs bg-slate-900 px-4 py-1 rounded-full transition-colors duration-300';
    }
}

function labProcess(action, element) {
    if (isAnimating) return;
    const expectedAction = expectedSequence[currentStepIdx];
    const tube = document.getElementById('main-tube');

    if (action === expectedAction) {
        // --- ПРАВИЛЬНЫЙ ШАГ ---
        if (action === 'pha') {
            isAnimating = true;
            currentStepIdx++;
            setLabHint('Успешно: ФГА добавлен. Клетки готовы к стимуляции.', 'success');
            tube.classList.add('scale-105');
            setTimeout(() => { tube.classList.remove('scale-105'); isAnimating = false; setLabHint('Статус: Ожидание'); }, 1500);
        }
        else if (action === 'inc') {
            document.getElementById('modal-incubator').classList.remove('hidden');
            document.getElementById('modal-incubator').classList.add('flex');
        }
        else if (action === 'col') {
            document.getElementById('modal-colchicine').classList.remove('hidden');
            document.getElementById('modal-colchicine').classList.add('flex');
            startColchicineGame();
        }
        else if (action === 'spin') {
            isAnimating = true; currentStepIdx++;
            setLabHint('Успешно: Центрифугирование...', 'success');
            element.classList.add('spinning');
            tube.classList.add('opacity-0');
            setTimeout(() => { 
                element.classList.remove('spinning'); 
                tube.src = 'assets/tube_pellet.png'; 
                tube.classList.remove('opacity-0'); 
                isAnimating = false;
                setLabHint('Статус: Осадок сформирован'); 
            }, 3000);
        }
        else if (action === 'kcl') {
            document.getElementById('modal-kcl').classList.remove('hidden');
            document.getElementById('modal-kcl').classList.add('flex');
            setupKClGame();
        }
        else if (action === 'fix') {
            isAnimating = true; currentStepIdx++;
            setLabHint('Успешно: Фиксатор Карнуа добавлен.', 'success');
            tube.classList.add('scale-105');
            setTimeout(() => { tube.classList.remove('scale-105'); isAnimating = false; setLabHint('Статус: Ожидание'); }, 1500);
        }
        else if (action === 'drop') {
            document.getElementById('modal-drop').classList.remove('hidden');
            document.getElementById('modal-drop').classList.add('flex');
        }
        else if (action === 'trypsin') {
            isAnimating = true; currentStepIdx++;
            setLabHint('Успешно: Препарат обработан трипсином и окрашен Гимзой.', 'success');
            setTimeout(() => { isAnimating = false; setLabHint('Статус: Готово к микроскопии'); }, 1500);
        }
        else if (action === 'micro') {
            isAnimating = true; currentStepIdx++;
            setLabHint('Успешно: Анализ...', 'success');
            setTimeout(() => {
                prepareResultView();
                switchScreen('app-res');
            }, 1500);
        }
    } else {
        // --- ОШИБКА ПРОТОКОЛА ---
        let errorKey = 'generic_wrong';
        
        // Определяем специфичную ошибку
        if (action === 'kcl' && expectedAction === 'col') {
            errorKey = 'kcl_before_colchicine';
        } else if (action === 'fix' && expectedAction === 'kcl') {
            errorKey = 'fix_before_kcl';
        } else if (action === 'trypsin' && expectedAction !== 'trypsin') {
            // Кнопка в HTML передает 'trypsin', даже если это Гимза
            errorKey = 'giemsa_before_trypsin';
        }

        // Вызываем окно с пояснением профессора
        showLabError(errorKey);
        
        // Визуальная встряска
        setLabHint(`Ошибка протокола! Вы нарушили последовательность.`, 'error');
        element.classList.add('error-shake');
        tube.classList.add('error-shake'); // Трясем и пробирку тоже для эффекта
        setTimeout(() => {
            element.classList.remove('error-shake');
            tube.classList.remove('error-shake');
        }, 500);
    }
}

// Функции управления окном ошибки
function showLabError(key) {
    const error = labErrors[key] || labErrors['generic_wrong'];
    const overlay = document.getElementById('lab-error-overlay');
    
    // 1. Заполняем данные
    document.querySelector('#lab-error-overlay h3').textContent = error.title;
    document.getElementById('lab-error-desc').textContent = error.desc;
    document.getElementById('lab-error-theory').textContent = error.theory;
    
    // 2. Сначала убираем hidden и ставим flex, но окно еще прозрачное (opacity 0)
    overlay.classList.remove('hidden');
    overlay.classList.add('flex');

    // 3. Через микро-таймаут добавляем класс 'show', который запустит CSS-анимацию
    setTimeout(() => {
        overlay.classList.add('show');
    }, 10); 
}
function closeLabError() {
    const overlay = document.getElementById('lab-error-overlay');
    
    // 1. Сначала убираем визуальный класс
    overlay.classList.remove('show');
    
    // 2. Ждем 300мс (время транзиции), пока окно станет прозрачным, и только потом скрываем совсем
    setTimeout(() => {
        overlay.classList.add('hidden');
        overlay.classList.remove('flex');
    }, 300);
}

// 6. Результаты и диагностика
function prepareResultView() {
    document.getElementById('res-title').textContent = '(кариограмма готова)';
    document.getElementById('res-formula').textContent = '-';
    document.getElementById('final-img').classList.add('hidden-item');
    document.getElementById('karyotype-button').classList.remove('hidden-item');
    document.getElementById('diagnostic-selection').classList.add('hidden');
    document.getElementById('diagnostic-feedback').textContent = '';
}

function revealKaryotype() {
    const finalImg = document.getElementById('final-img');
    
    finalImg.src = activeClinicalCase.resultImg || 'assets/default_karyo.png';
    finalImg.classList.remove('hidden-item', 'placeholder');
    document.getElementById('karyotype-button').classList.add('hidden-item');
    
    if (activeClinicalCase.isComplex) {
        const warning = document.getElementById('fish-warning');
        if (warning) warning.classList.remove('hidden-item');
        document.getElementById('diagnostic-selection').classList.add('hidden');
    } else {
        const warning = document.getElementById('fish-warning');
        if (warning) warning.classList.add('hidden-item');
        renderDiagnosisButtons();
    }
}

function renderDiagnosisButtons() {
    const container = document.getElementById('diagnostic-selection');
    container.classList.remove('hidden');
    container.innerHTML = ''; 

    activeClinicalCase.options.forEach((opt, idx) => {
        const card = document.createElement('div');
        card.className = 'choice-card bg-slate-900 p-6 rounded-xl text-center cursor-pointer hover:bg-slate-800 transition border border-white/5';
        card.innerHTML = `<h4 class="font-bold text-white text-lg">${opt.title}</h4>`;
        card.onclick = () => chooseDiagnosis(idx);
        container.appendChild(card);
    });
}

function chooseDiagnosis(idx) {
    const chosen = activeClinicalCase.options[idx];
    const feedback = document.getElementById('diagnostic-feedback');
    
    if (chosen.correct) {
        document.getElementById('res-title').textContent = chosen.title;
        document.getElementById('res-formula').textContent = activeClinicalCase.formula;
        document.getElementById('res-desc').textContent = 'Диагноз подтвержден.';
        document.getElementById('res-method').textContent = activeClinicalCase.method;

        const infoContainer = document.getElementById('res-disease-info');
        const d = activeClinicalCase.details;
        infoContainer.innerHTML = `
            <details class="bg-slate-900 p-4 rounded-xl mb-2"><summary class="text-white font-bold">Патогенез</summary><p class="text-slate-300 text-sm">${d.pathogenesis}</p></details>
            <details class="bg-slate-900 p-4 rounded-xl mb-2"><summary class="text-white font-bold">Клиника</summary><p class="text-slate-300 text-sm">${d.clinic}</p></details>
            <details class="bg-slate-900 p-4 rounded-xl mb-2"><summary class="text-white font-bold">Лечение</summary><p class="text-slate-300 text-sm">${d.therapy}</p></details>
        `;
        feedback.textContent = 'Верно!';
        feedback.className = 'text-green-400 font-bold mb-8';
    } else {
        feedback.textContent = 'Неверно. Посмотрите на кариограмму внимательнее.';
        feedback.className = 'text-red-400 font-bold mb-8';
    }
}

// Функции для кнопок в HTML
function checkMethod(element, isCorrect) {
    if (isCorrect) switchScreen('app-theory');
    else {
        element.classList.add('wrong');
        document.getElementById('case-error').classList.remove('hidden');
        setTimeout(() => element.classList.remove('wrong'), 500);
    }
}

function goToPrep() { switchScreen('app-prep'); }
// --- FISH LABORATORY LOGIC ---
let fishStepIdx = 0;
let isFishAnimating = false;
let pendingFishElement = null; // Для сохранения элемента во время открытых модалок

const expectedFishSequence = [
    'pepsin',       
    'ethanol',      
    'probe',        
    'thermobrite',  
    'wash',         
    'dapi',         
    'fluor_micro'   
];

function setFishLabHint(text, type) {
    const hint = document.getElementById('fish-lab-hint');
    hint.textContent = text;
    if (type === 'error') {
        hint.className = 'text-red-400 font-bold uppercase mono tracking-widest text-xs bg-red-900/50 px-4 py-1 rounded-full transition-colors duration-300 shadow-[0_0_15px_rgba(239,68,68,0.5)]';
    } else if (type === 'success') {
        hint.className = 'text-green-400 font-bold uppercase mono tracking-widest text-xs bg-green-900/50 px-4 py-1 rounded-full transition-colors duration-300 shadow-[0_0_15px_rgba(34,197,94,0.5)]';
    } else {
        hint.className = 'text-purple-400 font-bold uppercase mono tracking-widest text-xs bg-purple-900/30 px-4 py-1 rounded-full transition-colors duration-300 border border-purple-500/30';
    }
}

function fishLabProcess(action, element) {
    if (isFishAnimating) return;

    // ИДЕЯ 3: Обманки
    if (action === 'giemsa_decoy' || action === 'kcl_decoy') {
        setFishLabHint('Критическая ошибка! Этот реагент используется в G-бэндинге и испортит FISH-препарат.', 'error');
        element.classList.add('error-shake');
        setTimeout(() => element.classList.remove('error-shake'), 500);
        return;
    }

    const expectedAction = expectedFishSequence[fishStepIdx];

    // ИДЕЯ 1: Выбор правильного зонда
    if (action.startsWith('probe_')) {
        const targetProbe = activeClinicalCase.targetProbe || 'probe_21';
        if (action !== targetProbe) {
            setFishLabHint('Ошибка! Выбран нецелевой зонд. Дорогостоящий реагент потрачен впустую.', 'error');
            element.classList.add('error-shake');
            setTimeout(() => element.classList.remove('error-shake'), 500);
            return;
        }
        action = 'probe'; // Нормализуем для проверки последовательности
    }

    if (action === expectedAction) {
        // ИДЕЯ 4: Вопрос "У ворот" перед Пепсином
        if (action === 'pepsin') {
            pendingFishElement = element;
            openQuiz(
                'Какую основную роль выполняет Пепсин на данном этапе FISH?',
                [
                    { text: 'Разрушает водородные связи ДНК', correct: false },
                    { text: 'Разрушает белковый матрикс и цитоплазму (очистка)', correct: true },
                    { text: 'Окрашивает хромосомы для флуоресценции', correct: false }
                ],
                () => executeFishAnimation('pepsin', pendingFishElement)
            );
            return;
        }

        // ИДЕЯ 2: Настройка ThermoBrite
        if (action === 'thermobrite') {
            pendingFishElement = element;
            document.getElementById('modal-thermobrite').classList.remove('hidden');
            document.getElementById('modal-thermobrite').classList.add('flex');
            return;
        }

        // Если проверок нет, сразу запускаем анимацию
        executeFishAnimation(action, element);

    } else {
        setFishLabHint(`Ошибка! Нарушение протокола FISH.`, 'error');
        element.classList.add('error-shake');
        setTimeout(() => element.classList.remove('error-shake'), 500);
    }
}

// Выполнение самих анимаций (вынесено из fishLabProcess)
function executeFishAnimation(action, element) {
    isFishAnimating = true;
    fishStepIdx++;
    const slide = document.getElementById('fish-main-slide');

    if (action === 'pepsin') {
        setFishLabHint('Успешно: Обработка пепсином. Белковый мусор удален.', 'success');
        slide.style.filter = 'brightness(1.2)';
        setTimeout(() => { slide.style.filter = ''; isFishAnimating = false; setFishLabHint('Статус: Ожидание дегидратации', 'normal'); }, 1500);
    }
    else if (action === 'ethanol') {
        setFishLabHint('Успешно: Серия этанола. Препарат обезвожен.', 'success');
        slide.classList.add('scale-105');
        setTimeout(() => { slide.classList.remove('scale-105'); isFishAnimating = false; setFishLabHint('Статус: Ожидание зонда', 'normal'); }, 1500);
    }
    else if (action === 'probe') {
        setFishLabHint('Успешно: Целевой ДНК-зонд нанесен.', 'success');
        const drop = document.getElementById('fish-drop-anim');
        drop.classList.remove('hidden-item');
        drop.classList.add('dropping');
        setTimeout(() => { drop.classList.add('hidden-item'); drop.classList.remove('dropping'); isFishAnimating = false; setFishLabHint('Статус: Накройте стеклом и поместите в гибридизатор', 'normal'); }, 1000);
    }
    else if (action === 'thermobrite') {
        setFishLabHint('Успешно: Денатурация и Гибридизация завершены.', 'success');
        slide.classList.add('opacity-0');
        element.classList.add('scale-110');
        element.style.filter = 'drop-shadow(0 0 20px rgba(239,68,68,0.8))'; 
        setTimeout(() => { element.classList.remove('scale-110'); element.style.filter = ''; slide.classList.remove('opacity-0'); isFishAnimating = false; setFishLabHint('Статус: Ожидание отмывки', 'normal'); }, 3000);
    }
    else if (action === 'wash') {
        setFishLabHint('Успешно: Стрингентная отмывка. Несвязанные зонды удалены.', 'success');
        slide.style.filter = 'opacity(0.8) blur(1px)';
        setTimeout(() => { slide.style.filter = ''; isFishAnimating = false; setFishLabHint('Статус: Ожидание контрастирования', 'normal'); }, 1500);
    }
    else if (action === 'dapi') {
        setFishLabHint('Успешно: Нанесение DAPI.', 'success');
        slide.style.filter = 'drop-shadow(0 0 10px rgba(59,130,246,0.6))'; 
        setTimeout(() => { isFishAnimating = false; setFishLabHint('Статус: Препарат готов к микроскопии', 'normal'); }, 1500);
    }
    else if (action === 'fluor_micro') {
        setFishLabHint('Успешно: Включение УФ-лампы. Анализ...', 'success');
        setTimeout(() => { showFishResults(); }, 1500);
    }
}

// --- УПРАВЛЕНИЕ МОДАЛКАМИ ---

function closeFishModal(id) {
    document.getElementById(id).classList.remove('flex');
    document.getElementById(id).classList.add('hidden');
    // ВАЖНО: Мы убрали отсюда очистку pendingFishElement, чтобы анимация не ломалась!
}

function submitThermoBrite() {
    const denat = parseInt(document.getElementById('tb-denat').value);
    const hybr = parseInt(document.getElementById('tb-hybr').value);

    if (denat >= 71 && denat <= 75 && hybr === 37) {
        // 1. Сохраняем элемент ДО закрытия окна
        const elementToAnimate = pendingFishElement; 
        
        // 2. Закрываем окно
        closeFishModal('modal-thermobrite');
        
        // 3. Запускаем анимацию с сохраненным элементом
        executeFishAnimation('thermobrite', elementToAnimate);
        
        // 4. Очищаем переменную
        pendingFishElement = null;
    } else {
        alert("Ошибка температурного режима! Препарат испорчен. Денатурация должна быть около 73°C, а гибридизация 37°C.");
    }
}

// Логика Викторины
let onQuizSuccess = null;

function openQuiz(question, options, onSuccess) {
    document.getElementById('quiz-question').textContent = question;
    const container = document.getElementById('quiz-options');
    container.innerHTML = '';
    document.getElementById('quiz-error').classList.add('hidden');
    onQuizSuccess = onSuccess;

    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'w-full text-left p-4 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-xl text-white transition';
        btn.textContent = opt.text;
        btn.onclick = () => handleQuizAnswer(opt.correct);
        container.appendChild(btn);
    });

    document.getElementById('modal-quiz').classList.remove('hidden');
    document.getElementById('modal-quiz').classList.add('flex');
}

function handleQuizAnswer(isCorrect) {
    if (isCorrect) {
        closeFishModal('modal-quiz');
        if (onQuizSuccess) onQuizSuccess();
    } else {
        document.getElementById('quiz-error').classList.remove('hidden');
    }
}
function showFishResults() {
    // Переходим обратно на экран результатов, но обновляем данные под FISH
    switchScreen('app-res');
    
    document.getElementById('res-title').textContent = '(FISH-анализ завершен)';
    document.getElementById('fish-warning').classList.add('hidden-item');
    
    // Показываем фотку FISH вместо обычного кариотипа
    const finalImg = document.getElementById('final-img');
    finalImg.src = activeClinicalCase.fishImg; 
    finalImg.classList.remove('hidden-item', 'placeholder');
    
    // Обновляем текст метода
    document.getElementById('res-method').innerHTML = '<span class="text-purple-400 font-bold">Fluorescence in situ hybridization (FISH)</span><br>Использованы зонды LSI 21 (оранжевый) и CEP 14 (зеленый).';
    
    // Рендерим кнопки для финального диагноза
    renderDiagnosisButtons();
}
// --- ИГРА 1: ИНКУБАТОР ---
let currentIncTime = 48;
function changeIncTime(delta) {
    currentIncTime += delta;
    if(currentIncTime < 12) currentIncTime = 12;
    if(currentIncTime > 120) currentIncTime = 120;
    document.getElementById('inc-time-display').textContent = currentIncTime;
}
function submitIncubator() {
    document.getElementById('modal-incubator').classList.add('hidden');
    document.getElementById('modal-incubator').classList.remove('flex');
    
    isAnimating = true;
    currentStepIdx++;
    const tube = document.getElementById('main-tube');
    tube.classList.add('opacity-0');

    if(currentIncTime === 72) {
        setLabHint('Идеально: 72 часа инкубации. Митотический индекс оптимален.', 'success');
    } else if (currentIncTime < 72) {
        setLabHint('Предупреждение: Мало времени. Мало метафазных пластинок.', 'error');
    } else {
        setLabHint('Предупреждение: Клетки начали гибнуть от интоксикации.', 'error');
    }

    setTimeout(() => { tube.classList.remove('opacity-0'); isAnimating = false; }, 2000);
}

// --- ИГРА 2: КОЛХИЦИН ---
let colInterval;
let colProgress = 0;
let colDirection = 1;

function startColchicineGame() {
    colProgress = 0;
    const bar = document.getElementById('col-progress');
    clearInterval(colInterval);
    colInterval = setInterval(() => {
        colProgress += 2 * colDirection;
        if(colProgress >= 100 || colProgress <= 0) colDirection *= -1;
        bar.style.width = colProgress + '%';
    }, 30);
}

function stopColchicine() {
    clearInterval(colInterval);
    document.getElementById('modal-colchicine').classList.add('hidden');
    document.getElementById('modal-colchicine').classList.remove('flex');
    
    isAnimating = true;
    currentStepIdx++;
    
    if(colProgress >= 60 && colProgress <= 80) {
         setLabHint('Успешно: Идеальная спирализация хромосом.', 'success');
    } else {
         setLabHint('Ошибка тайминга: Хромосомы будут слишком короткими или длинными.', 'error');
    }
    setTimeout(() => { isAnimating = false; }, 1500);
}

// --- ИГРА 3: KCl (УДЕРЖАНИЕ) ---
let kclInterval;
let kclProgress = 0;

function setupKClGame() {
    kclProgress = 0;
    document.getElementById('kcl-progress').style.width = '0%';
    const btn = document.getElementById('btn-kcl-hold');
    
    // Очищаем старые слушатели, чтобы не дублировались
    btn.onmousedown = startKClFill;
    btn.onmouseup = stopKClFill;
    btn.onmouseleave = stopKClFill;
    
    // Для мобилок
    btn.ontouchstart = (e) => { e.preventDefault(); startKClFill(); };
    btn.ontouchend = stopKClFill;
}

function startKClFill() {
    clearInterval(kclInterval);
    kclInterval = setInterval(() => {
        kclProgress += 1;
        if(kclProgress > 100) kclProgress = 100;
        document.getElementById('kcl-progress').style.width = kclProgress + '%';
    }, 30);
}

function stopKClFill() {
    if(kclProgress === 0) return; // Защита от случайного клика
    clearInterval(kclInterval);
    
    document.getElementById('modal-kcl').classList.add('hidden');
    document.getElementById('modal-kcl').classList.remove('flex');
    
    isAnimating = true;
    currentStepIdx++;
    const tube = document.getElementById('main-tube');
    tube.src = 'assets/tube_swollen.png';
    tube.classList.add('scale-105');

    if(kclProgress >= 80 && kclProgress <= 95) {
        setLabHint('Успешно: Клетки идеально набухли.', 'success');
    } else if(kclProgress > 95) {
        setLabHint('Критическая ошибка: Вы перелили KCl. Клетки лопнули в пробирке.', 'error');
    } else {
        setLabHint('Ошибка: Недостаточный гипотонический шок.', 'error');
    }
    
    setTimeout(() => { tube.classList.remove('scale-105'); isAnimating = false; }, 1500);
}

// --- ИГРА 4: РАСКАПЫВАНИЕ ---
function submitDrop(height) {
    document.getElementById('modal-drop').classList.add('hidden');
    document.getElementById('modal-drop').classList.remove('flex');
    
    isAnimating = true;
    currentStepIdx++;
    
    const tube = document.getElementById('main-tube');
    tube.classList.add('opacity-0');
    document.getElementById('main-slide').classList.remove('hidden-item');
    
    const drop = document.getElementById('drop-anim');
    drop.classList.remove('hidden-item');
    drop.classList.add('dropping');

    if(height === 'optimal') {
         setLabHint('Идеально: Отличный спрэд метафазных пластинок.', 'success');
    } else {
         setLabHint('Стекло подготовлено с дефектами раскапывания.', 'error');
    }

    setTimeout(() => {
        drop.classList.add('hidden-item');
        drop.classList.remove('dropping');
        isAnimating = false;
    }, 1000);
}

// ===== МОБИЛЬНАЯ ПОДДЕРЖКА (touch drag) =====
// HTML5 drag API не работает на тачскринах — добавляем полифил через touch events.
(function initTouchDrag() {
    let touchDragEl = null;
    let ghost = null;
    let touchOffsetX = 0;
    let touchOffsetY = 0;

    function createGhost(el) {
        const rect = el.getBoundingClientRect();
        ghost = el.cloneNode(true);
        ghost.style.cssText = `
            position: fixed;
            pointer-events: none;
            z-index: 9998;
            width: ${rect.width}px;
            height: ${rect.height}px;
            opacity: 0.75;
            transform: scale(1.1);
            transition: none;
            top: ${rect.top}px;
            left: ${rect.left}px;
        `;
        document.body.appendChild(ghost);
    }

    function removeGhost() {
        if (ghost) { ghost.remove(); ghost = null; }
    }

    function getDropZoneAt(x, y, zoneId) {
        const zone = document.getElementById(zoneId);
        if (!zone) return false;
        const rect = zone.getBoundingClientRect();
        return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    }

    document.addEventListener('touchstart', e => {
        const el = e.target.closest('[data-action], [data-fish-action]');
        if (!el) return;
        touchDragEl = el;
        const touch = e.touches[0];
        const rect = el.getBoundingClientRect();
        touchOffsetX = touch.clientX - rect.left;
        touchOffsetY = touch.clientY - rect.top;
        createGhost(el);
        el.classList.add('is-dragging');

        // Подсветить нужную зону
        if (el.dataset.action) document.getElementById('drop-zone')?.classList.add('drop-ready');
        if (el.dataset.fishAction) document.getElementById('fish-drop-zone')?.classList.add('drop-ready');
    }, { passive: true });

    document.addEventListener('touchmove', e => {
        if (!touchDragEl || !ghost) return;
        e.preventDefault();
        const touch = e.touches[0];
        ghost.style.left = `${touch.clientX - touchOffsetX}px`;
        ghost.style.top  = `${touch.clientY - touchOffsetY}px`;

        const x = touch.clientX, y = touch.clientY;
        if (touchDragEl.dataset.action) {
            const zone = document.getElementById('drop-zone');
            if (zone) zone.classList.toggle('drop-hover', getDropZoneAt(x, y, 'drop-zone'));
        }
        if (touchDragEl.dataset.fishAction) {
            const zone = document.getElementById('fish-drop-zone');
            if (zone) zone.classList.toggle('drop-hover', getDropZoneAt(x, y, 'fish-drop-zone'));
        }
    }, { passive: false });

    document.addEventListener('touchend', e => {
        if (!touchDragEl) return;
        const touch = e.changedTouches[0];
        const x = touch.clientX, y = touch.clientY;

        // Cleanup visual state
        touchDragEl.classList.remove('is-dragging');
        document.getElementById('drop-zone')?.classList.remove('drop-ready', 'drop-hover');
        document.getElementById('fish-drop-zone')?.classList.remove('drop-ready', 'drop-hover');
        removeGhost();

        if (touchDragEl.dataset.action && getDropZoneAt(x, y, 'drop-zone')) {
            spawnPourParticle(touchDragEl, document.getElementById('drop-zone'));
            setTimeout(() => labProcess(touchDragEl.dataset.action, touchDragEl), 200);
        } else if (touchDragEl.dataset.fishAction && getDropZoneAt(x, y, 'fish-drop-zone')) {
            spawnPourParticle(touchDragEl, document.getElementById('fish-drop-zone'));
            setTimeout(() => fishLabProcess(touchDragEl.dataset.fishAction, touchDragEl), 200);
        }

        touchDragEl = null;
    });
})();
