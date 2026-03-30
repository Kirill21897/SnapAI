# Implementation Plan: OpenRouter Support

## Overview

Добавляем поддержку OpenRouter как альтернативного AI-провайдера. Изменения затрагивают три слоя: типы (`types.ts`), Service Worker (`background.ts`) и Settings Page (`options.ts` + `options.html`).

## Tasks

- [x] 1. Обновить типы и константы в `types.ts`
  - Добавить тип `Provider = 'openai' | 'openrouter'`
  - Добавить интерфейсы `ProviderConfig` и `ProviderSettings`
  - Обновить `StorageSchema`: добавить поля `provider`, `openaiApiKey`, `openrouterApiKey`, `openaiModel`, `openrouterModel`; пометить `apiKey` как устаревшее
  - Добавить константы `PROVIDER_DEFAULTS` и `OPENROUTER_HEADERS`
  - _Requirements: 1.2, 2.2, 2.3, 3.2, 3.3, 3.4, 4.2, 4.3, 5.1, 5.2_

- [x] 2. Реализовать вспомогательные функции в `background.ts`
  - [x] 2.1 Реализовать `migrateApiKey(): Promise<void>`
    - Читает `apiKey` и `openaiApiKey` из storage
    - Если `apiKey` есть и `openaiApiKey` отсутствует — копирует значение в `openaiApiKey` и удаляет `apiKey`
    - Иначе ничего не делает (идемпотентность)
    - _Requirements: 6.1, 6.2_

  - [ ]* 2.2 Написать property-тест для `migrateApiKey`
    - **Property 8: Миграция apiKey (round-trip + идемпотентность)**
    - **Validates: Requirements 6.1, 6.2**

  - [x] 2.3 Реализовать `buildHeaders(apiKey: string, provider: Provider): Record<string, string>`
    - Для `openrouter` добавляет `HTTP-Referer` и `X-Title: Context AI Assistant`
    - Для `openai` возвращает только `Content-Type` и `Authorization`
    - _Requirements: 5.1, 5.2, 5.3_

  - [ ]* 2.4 Написать property-тест для `buildHeaders`
    - **Property 7: Заголовки OpenRouter присутствуют только для OpenRouter**
    - **Validates: Requirements 5.1, 5.2, 5.3**

  - [ ]* 2.5 Написать property-тест: API-ключ только в заголовке Authorization
    - **Property 3: API-ключ передаётся только в заголовке Authorization**
    - **Validates: Requirements 2.6**

  - [x] 2.6 Реализовать `resolveProviderConfig(): Promise<ProviderConfig | null>`
    - Читает `provider` из storage (default: `'openai'`)
    - Возвращает `baseUrl`, `apiKey` и `model` для выбранного провайдера
    - Возвращает `null`, если API-ключ отсутствует
    - _Requirements: 4.1, 4.2, 4.3, 4.5, 4.6_

  - [ ]* 2.7 Написать property-тест для `resolveProviderConfig`
    - **Property 5: Маршрутизация запроса к правильному endpoint**
    - **Validates: Requirements 4.2, 4.3**

- [x] 3. Обновить `handleAIRequest` в `background.ts`
  - Вызывать `migrateApiKey()` в начале функции
  - Использовать `resolveProviderConfig()` вместо прямого чтения `apiKey`
  - Передавать `provider` в `buildHeaders()`
  - При `null` от `resolveProviderConfig` возвращать `AIError` с сообщением «Добавьте API-ключ в настройках расширения»
  - _Requirements: 4.1, 4.4, 4.5, 6.1_

  - [ ]* 3.1 Написать unit-тест: отсутствие API-ключа → `AIError`
    - Проверить, что при отсутствии ключа возвращается корректное сообщение об ошибке
    - _Requirements: 4.5_

  - [ ]* 3.2 Написать property-тест: тело запроса одинаково для обоих провайдеров
    - **Property 6: Тело запроса одинаково для обоих провайдеров**
    - **Validates: Requirements 4.4**

- [x] 4. Checkpoint — убедиться, что все тесты проходят
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Реализовать `saveProviderSettings` и `loadProviderSettings` в `options.ts`
  - [x] 5.1 Реализовать `saveProviderSettings(settings: ProviderSettings): Promise<void>`
    - Сохраняет `provider`, соответствующий `apiKey` и `model` в `browser.storage.local`
    - Если `apiKey` пустой — удаляет ключ из storage
    - _Requirements: 1.2, 2.2, 2.3, 2.5, 3.4_

  - [ ]* 5.2 Написать property-тест для `saveProviderSettings` / `loadProviderSettings`
    - **Property 1: Round-trip сохранения провайдера**
    - **Validates: Requirements 1.2, 1.3**

  - [ ]* 5.3 Написать property-тест: API-ключ сохраняется под правильным storage-ключом
    - **Property 2: API-ключ сохраняется под правильным storage-ключом**
    - **Validates: Requirements 2.2, 2.3**

  - [ ]* 5.4 Написать property-тест: round-trip сохранения модели
    - **Property 4: Round-trip сохранения модели**
    - **Validates: Requirements 3.2, 3.3, 3.4, 3.5**

  - [x] 5.5 Реализовать `loadProviderSettings(): Promise<ProviderSettings>`
    - Читает все поля провайдера из storage
    - Возвращает `'openai'` как провайдер по умолчанию, если не сохранён
    - _Requirements: 1.3, 3.5_

- [x] 6. Обновить `options.html` и `options.ts` (UI)
  - [x] 6.1 Добавить `<select id="provider">` с вариантами «OpenAI» и «OpenRouter» в `options.html`
    - Добавить поле `<input id="model">` с placeholder по умолчанию
    - _Requirements: 1.1, 3.1_

  - [x] 6.2 Обновить логику `init()` в `options.ts`
    - При загрузке страницы отображать сохранённый провайдер, ключ (маскированный) и модель
    - При смене провайдера обновлять placeholder полей и загружать сохранённые значения
    - Кнопка «Сохранить» вызывает `saveProviderSettings`
    - Кнопка «Очистить» удаляет ключ текущего провайдера
    - _Requirements: 1.3, 1.4, 2.1, 2.4, 2.5, 3.1, 3.5_

  - [ ]* 6.3 Написать unit-тесты для UI
    - Settings Page содержит `<select>` с вариантами «OpenAI» и «OpenRouter» (Req 1.1)
    - Settings Page содержит поле ввода API-ключа (Req 2.1)
    - Settings Page содержит поле ввода модели (Req 3.1)
    - Очистка API-ключа удаляет его из storage (Req 2.5)
    - _Requirements: 1.1, 2.1, 2.5, 3.1_

- [x] 7. Final checkpoint — убедиться, что все тесты проходят
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Задачи с `*` опциональны и могут быть пропущены для быстрого MVP
- Каждая задача ссылается на конкретные требования для трассируемости
- Property-тесты используют `fast-check` + Vitest (уже настроены в проекте)
- Миграция `apiKey` идемпотентна — безопасно вызывать при каждом запросе
