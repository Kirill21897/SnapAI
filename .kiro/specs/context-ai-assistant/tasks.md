# План реализации: Context AI Assistant

## Обзор

Реализация браузерного расширения (Manifest V3, TypeScript) с поэтапным построением: сначала структура проекта и типы, затем каждый компонент с тестами, в конце — сборка и интеграция.

## Задачи

- [x] 1. Настройка структуры проекта и базовых типов
  - Создать `manifest.json` (Manifest V3) с объявлением content script, service worker, options page и необходимых permissions (`storage`, `activeTab`, `clipboardWrite`)
  - Создать `tsconfig.json` и `package.json` с зависимостями: TypeScript, Vitest, fast-check
  - Создать файл `src/types.ts` с интерфейсами: `SelectionState`, `Message`, `PanelState`, `Action`, `AIRequest`, `AIResponse`, `AIError`, `RequestMessage`, `ResponseMessage`, `StorageSchema`, `OpenAIChatRequest`, `OpenAIMessage`
  - Создать константы `SYSTEM_PROMPTS` и ограничения (`MAX_SELECTION_LENGTH`, `MAX_QUOTE_LENGTH`, `MAX_DIALOG_DEPTH`, `REQUEST_TIMEOUT_MS`)
  - _Требования: 1.1, 1.3, 2.2, 3.1–3.3, 4.1, 8.3_

- [x] 2. Реализация Service Worker
  - [x] 2.1 Реализовать `src/background.ts`: `getApiKey`, `saveApiKey`, `clearApiKey`, `handleAIRequest` с таймаутом через `AbortController` (15 с), формированием `messages` для OpenAI Chat Completions API и обработкой ошибок как `AIError`
    - Слушать `chrome.runtime.onMessage` для типа `AI_REQUEST`, возвращать `AI_RESPONSE`
    - _Требования: 5.1, 5.2, 7.2, 7.3_

  - [ ]* 2.2 Property-тест: round-trip сохранения API-ключа
    - **Property 11: Round-trip сохранения API-ключа**
    - **Validates: Requirements 7.2**

  - [ ]* 2.3 Property-тест: API-ключ только в заголовке запроса
    - **Property 12: API-ключ передаётся только в заголовке запроса**
    - **Validates: Requirements 7.3**

  - [ ]* 2.4 Property-тест: формирование запроса для предустановленного действия
    - **Property 5: Формирование запроса для предустановленного действия**
    - **Validates: Requirements 3.1, 3.2, 3.3**

  - [ ]* 2.5 Property-тест: Query + Selection в запросе
    - **Property 7: Запрос с произвольным Query содержит Selection и Query**
    - **Validates: Requirements 4.1**

  - [ ]* 2.6 Property-тест: контекст диалога включает историю
    - **Property 13: Контекст диалога включает историю**
    - **Validates: Requirements 8.2**

  - [ ]* 2.7 Property-тест: инвариант глубины диалога
    - **Property 14: Инвариант глубины диалога**
    - **Validates: Requirements 8.3**

  - [ ]* 2.8 Property-тест: обработка ошибки AI_Service
    - **Property 8: Обработка ошибки AI_Service**
    - **Validates: Requirements 5.1, 5.2**

  - [ ]* 2.9 Property-тест: повтор запроса идентичен оригиналу
    - **Property 9: Повтор запроса идентичен оригиналу**
    - **Validates: Requirements 5.3**

- [x] 3. Контрольная точка — все тесты Service Worker проходят
  - Убедиться, что все тесты проходят. Задать вопросы пользователю при необходимости.

- [x] 4. Реализация Content Script
  - [x] 4.1 Реализовать `src/content.ts`: `getSelection`, `showTriggerIcon`, `hideTriggerIcon`, `openPanel`, `closePanel`
    - Слушать `mouseup` / `selectionchange`; показывать иконку при валидном выделении (1–10 000 символов) в течение 300 мс; скрывать при снятии выделения
    - При выделении > 10 000 символов — не показывать иконку
    - _Требования: 1.1, 1.2, 1.3, 1.4_

  - [ ]* 4.2 Property-тест: показ иконки при валидном выделении
    - **Property 1: Показ иконки при валидном выделении**
    - **Validates: Requirements 1.1**

  - [ ]* 4.3 Property-тест: скрытие иконки при снятии выделения
    - **Property 2: Скрытие иконки при снятии выделения**
    - **Validates: Requirements 1.2**

  - [ ]* 4.4 Unit-тест: граничные значения выделения (10 000 и 10 001 символов)
    - Selection = 10 000 символов — иконка показывается
    - Selection = 10 001 символов — иконка не показывается
    - _Требования: 1.1, 1.3_

- [x] 5. Реализация Panel Component
  - [x] 5.1 Реализовать `src/panel.ts`: монтирование в Shadow DOM, отображение цитаты Selection (усечение до 300 символов с «…»), три кнопки Action, поле ввода Query, индикатор загрузки, область Response, кнопка «Копировать», кнопка «Повторить»
    - Управлять `PanelState` (selection, messages, isLoading, error)
    - Закрывать панель по Escape и клику за пределами
    - _Требования: 2.1–2.6, 3.4, 3.5, 4.2–4.4, 5.1–5.4, 6.1–6.3, 8.1_

  - [ ]* 5.2 Property-тест: усечение цитаты в панели
    - **Property 3: Усечение цитаты в панели**
    - **Validates: Requirements 2.2**

  - [ ]* 5.3 Property-тест: закрытие панели при dismiss-событии
    - **Property 4: Закрытие панели при dismiss-событии**
    - **Validates: Requirements 2.5, 2.6**

  - [ ]* 5.4 Property-тест: состояние загрузки блокирует повторную отправку
    - **Property 6: Состояние загрузки блокирует повторную отправку**
    - **Validates: Requirements 3.4, 4.3**

  - [ ]* 5.5 Property-тест: round-trip копирования ответа
    - **Property 10: Round-trip копирования ответа**
    - **Validates: Requirements 6.1, 6.2**

  - [ ]* 5.6 Unit-тест: панель содержит три кнопки Action и поле Query
    - _Требования: 2.3, 2.4_

  - [ ]* 5.7 Unit-тест: пустой Query — запрос не отправляется, показывается подсказка
    - _Требования: 4.2_

  - [ ]* 5.8 Unit-тест: отсутствие API-ключа — показывается нужное сообщение
    - _Требования: 5.4_

- [x] 6. Контрольная точка — все тесты Panel проходят
  - Убедиться, что все тесты проходят. Задать вопросы пользователю при необходимости.

- [x] 7. Реализация Options Page
  - [x] 7.1 Реализовать `src/options.ts` и `options.html`: форма с полем API-ключа, кнопки «Сохранить» и «Очистить», функции `saveApiKey`, `clearApiKey`, `loadApiKey`
    - При загрузке страницы — показывать маскированный ключ, если он сохранён
    - _Требования: 7.1, 7.2, 7.4_

  - [ ]* 7.2 Unit-тест: страница настроек содержит поле API-ключа
    - _Требования: 7.1_

  - [ ]* 7.3 Unit-тест: сохранить → очистить → проверить отсутствие ключа
    - _Требования: 7.4_

- [x] 8. Интеграция и сборка
  - [x] 8.1 Настроить сборку (например, `vite` или `esbuild`) для компиляции `content.ts`, `background.ts`, `options.ts` в отдельные бандлы
    - Убедиться, что `manifest.json` корректно ссылается на собранные файлы
    - _Требования: все_

  - [x] 8.2 Связать Content Script и Panel: клик по иконке монтирует Panel в Shadow DOM, Panel отправляет сообщения в Service Worker, Service Worker возвращает ответ в Panel
    - Проверить полный поток: выделение → иконка → панель → Action/Query → Response
    - _Требования: 1.1, 2.1, 3.1–3.5, 4.1–4.4, 5.1–5.4, 8.1–8.3_

- [x] 9. Финальная контрольная точка — все тесты проходят
  - Убедиться, что все тесты проходят. Задать вопросы пользователю при необходимости.

## Примечания

- Задачи с `*` — опциональны, можно пропустить для ускорения MVP
- Каждая задача ссылается на конкретные требования для трассируемости
- Property-тесты запускаются минимум 100 итераций (fast-check + Vitest)
- Unit-тесты покрывают граничные случаи и конкретные примеры
