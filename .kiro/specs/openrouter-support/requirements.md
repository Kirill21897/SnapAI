# Документ требований: OpenRouter Support

## Введение

Данная фича добавляет поддержку OpenRouter в браузерное расширение Context AI Assistant. OpenRouter — это роутер к множеству AI-моделей, совместимый с форматом OpenAI Chat Completions API (тот же формат запросов, другой base URL: `https://openrouter.ai/api/v1`). Пользователь сможет выбрать провайдера (OpenAI или OpenRouter) на странице настроек, ввести соответствующий API-ключ и при необходимости выбрать модель.

---

## Глоссарий

- **Extension** — браузерное расширение Context AI Assistant.
- **Provider** — поставщик AI-сервиса: OpenAI или OpenRouter.
- **OpenAI** — провайдер с base URL `https://api.openai.com/v1`.
- **OpenRouter** — провайдер с base URL `https://openrouter.ai/api/v1`, совместимый с OpenAI Chat Completions API.
- **AI_Service** — внешний AI API, к которому Extension обращается для получения ответа; конкретный endpoint определяется выбранным Provider.
- **API_Key** — секретный ключ для аутентификации запросов к AI_Service.
- **Model** — идентификатор языковой модели, передаваемый в поле `model` запроса к AI_Service.
- **Settings_Page** — страница настроек расширения (`options.html`).
- **Service_Worker** — фоновый скрипт расширения (`background.ts`), проксирующий запросы к AI_Service.
- **StorageSchema** — схема данных, хранящихся в `browser.storage.local`.

---

## Требования

### Требование 1: Выбор провайдера в настройках

**User Story:** Как пользователь, я хочу выбрать провайдера AI (OpenAI или OpenRouter) в настройках расширения, чтобы использовать тот сервис, к которому у меня есть доступ.

#### Критерии приёмки

1. THE Settings_Page SHALL содержать элемент выбора Provider с вариантами «OpenAI» и «OpenRouter».
2. WHEN пользователь выбирает Provider, THE Settings_Page SHALL сохранить выбранный Provider в `browser.storage.local`.
3. WHEN пользователь открывает Settings_Page, THE Settings_Page SHALL отобразить ранее сохранённый Provider; если Provider не сохранён, THE Settings_Page SHALL отобразить «OpenAI» как значение по умолчанию.
4. WHEN пользователь изменяет Provider, THE Settings_Page SHALL обновить форму ввода API_Key и Model в соответствии с выбранным Provider.

---

### Требование 2: Ввод API-ключа для выбранного провайдера

**User Story:** Как пользователь, я хочу вводить отдельный API-ключ для каждого провайдера, чтобы не перезаписывать ключ при переключении между OpenAI и OpenRouter.

#### Критерии приёмки

1. THE Settings_Page SHALL содержать поле ввода API_Key, соответствующее выбранному Provider.
2. WHEN пользователь сохраняет API_Key для Provider «OpenAI», THE Extension SHALL сохранить его в `browser.storage.local` под ключом `openaiApiKey`.
3. WHEN пользователь сохраняет API_Key для Provider «OpenRouter», THE Extension SHALL сохранить его в `browser.storage.local` под ключом `openrouterApiKey`.
4. WHEN пользователь открывает Settings_Page, THE Settings_Page SHALL отобразить маскированное значение сохранённого API_Key для текущего Provider, если ключ существует.
5. IF пользователь очищает поле API_Key и сохраняет настройки, THEN THE Extension SHALL удалить сохранённый API_Key текущего Provider из `browser.storage.local`.
6. THE Extension SHALL передавать API_Key только в заголовке `Authorization: Bearer` HTTPS-запросов к AI_Service и не включать его в тело запроса или URL.

---

### Требование 3: Выбор модели

**User Story:** Как пользователь, я хочу выбрать или ввести идентификатор модели для каждого провайдера, чтобы использовать нужную мне языковую модель.

#### Критерии приёмки

1. THE Settings_Page SHALL содержать поле ввода Model для каждого Provider.
2. WHEN пользователь выбирает Provider «OpenAI» и не задаёт Model, THE Extension SHALL использовать модель `gpt-4o-mini` по умолчанию.
3. WHEN пользователь выбирает Provider «OpenRouter» и не задаёт Model, THE Extension SHALL использовать модель `openai/gpt-4o-mini` по умолчанию.
4. WHEN пользователь сохраняет значение Model, THE Extension SHALL сохранить его в `browser.storage.local` под ключом, соответствующим Provider (`openaiModel` или `openrouterModel`).
5. WHEN пользователь открывает Settings_Page, THE Settings_Page SHALL отобразить сохранённое значение Model для текущего Provider или значение по умолчанию, если Model не сохранена.

---

### Требование 4: Маршрутизация запросов к выбранному провайдеру

**User Story:** Как пользователь, я хочу, чтобы расширение автоматически отправляло запросы к выбранному провайдеру, не требуя от меня дополнительных действий при каждом запросе.

#### Критерии приёмки

1. WHEN Service_Worker получает запрос на обращение к AI_Service, THE Service_Worker SHALL прочитать сохранённый Provider из `browser.storage.local`.
2. WHEN выбранный Provider равен «OpenAI», THE Service_Worker SHALL отправить запрос на `https://api.openai.com/v1/chat/completions` с сохранённым API_Key для OpenAI и сохранённой моделью OpenAI.
3. WHEN выбранный Provider равен «OpenRouter», THE Service_Worker SHALL отправить запрос на `https://openrouter.ai/api/v1/chat/completions` с сохранённым API_Key для OpenRouter и сохранённой моделью OpenRouter.
4. THE Service_Worker SHALL формировать тело запроса в формате OpenAI Chat Completions API независимо от выбранного Provider.
5. IF сохранённый API_Key для выбранного Provider отсутствует, THEN THE Service_Worker SHALL вернуть ошибку: «Добавьте API-ключ в настройках расширения».
6. IF сохранённый Provider не определён, THEN THE Service_Worker SHALL использовать «OpenAI» как значение по умолчанию.

---

### Требование 5: Добавление обязательных заголовков OpenRouter

**User Story:** Как разработчик, я хочу, чтобы расширение передавало обязательные заголовки при запросах к OpenRouter, чтобы соответствовать требованиям API OpenRouter.

#### Критерии приёмки

1. WHEN Service_Worker отправляет запрос к OpenRouter, THE Service_Worker SHALL включить заголовок `HTTP-Referer` со значением идентификатора расширения.
2. WHEN Service_Worker отправляет запрос к OpenRouter, THE Service_Worker SHALL включить заголовок `X-Title` со значением «Context AI Assistant».
3. WHEN Service_Worker отправляет запрос к OpenAI, THE Service_Worker SHALL отправить запрос без заголовков `HTTP-Referer` и `X-Title`.

---

### Требование 6: Обратная совместимость с существующими настройками

**User Story:** Как пользователь, уже использующий расширение с OpenAI, я хочу, чтобы мои текущие настройки продолжали работать после обновления, чтобы не настраивать расширение заново.

#### Критерии приёмки

1. WHEN Extension обнаруживает в `browser.storage.local` ключ `apiKey` (формат до обновления) и отсутствие ключа `openaiApiKey`, THE Extension SHALL использовать значение `apiKey` как API_Key для Provider «OpenAI».
2. WHEN Extension выполняет миграцию устаревшего `apiKey`, THE Extension SHALL сохранить его значение под ключом `openaiApiKey` и удалить ключ `apiKey` из `browser.storage.local`.
3. IF ключ `provider` отсутствует в `browser.storage.local`, THEN THE Service_Worker SHALL использовать «OpenAI» как Provider по умолчанию, обеспечивая непрерывность работы для существующих пользователей.
