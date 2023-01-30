/* eslint-disable no-console */
// импорт стандартных библиотек Node.js
const {existsSync, mkdirSync, readFileSync, writeFileSync, writeFile} = require('fs');
const {createServer} = require('http');

// файл для базы данных
const DB = process.env.DB || './db.json';
// файл для базы данных
const PORT = process.env.PORT || 8080;
// префикс URI для всех методов приложения
const URI = '/api/order';

/**
 * Класс ошибки, используется для отправки ответа с определённым кодом и описанием ошибки
 */
class ApiError extends Error {
  constructor(statusCode, data) {
    super();
    this.statusCode = statusCode;
    this.data = data;
  }
}

/**
 * Асинхронно считывает тело запроса и разбирает его как JSON
 * @param {Object} req - Объект HTTP запроса
 * @throws {ApiError} Некорректные данные в аргументе
 * @returns {Object} Объект, созданный из тела запроса
 */
function drainJson(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => {
      resolve(JSON.parse(data));
    });
  });
}


/**
 * Возвращает список товаров из базы данных
 * @param {{ search: string }} [params] - Поисковая строка
 * @returns {{ title: string, description: string, price: number, discount: number, count: number, units: string, images: string }[]} Массив товаров
 */
function getOrdersList() {
  const orders = JSON.parse(readFileSync(DB) || '[]');
  return orders;
}


function createOrder(data) {
  const id = Math.random().toString().substring(2, 8) + Date.now().toString().substring(9)
  const newItem = {...data, id};
  writeFileSync(DB, JSON.stringify([...getOrdersList(), newItem]), {encoding: 'utf8'});
  return newItem;
}


// создаём новый файл с базой данных, если он не существует
if (!existsSync(DB)) writeFileSync(DB, '[]', {encoding: 'utf8'});

// создаём HTTP сервер, переданная функция будет реагировать на все запросы к нему
module.exports = createServer(async (req, res) => {
  // req - объект с информацией о запросе, res - объект для управления отправляемым ответом

   // этот заголовок ответа указывает, что тело ответа будет в JSON формате
  res.setHeader('Content-Type', 'application/json');

  // CORS заголовки ответа для поддержки кросс-доменных запросов из браузера
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // запрос с методом OPTIONS может отправлять браузер автоматически для проверки CORS заголовков
  // в этом случае достаточно ответить с пустым телом и этими заголовками
  if (req.method === 'OPTIONS') {
    // end = закончить формировать ответ и отправить его клиенту
    res.end();
    return;
  }

  if  (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html");
    require("fs").readFile(`index.html`, (err, html) => {
      res.end(html);
    });
    return;
  }

  // если URI не начинается с нужного префикса - можем сразу отдать 404
  if (!req.url || (!req.url.startsWith(URI))) {
    res.statusCode = 404;
    res.end(JSON.stringify({message: 'Not Found'}));
    return;
  }

  try {
    // обрабатываем запрос и формируем тело ответа
    const uri = req.url.replace(URI, '');
    const body = await (async () => {
      if (uri === '' || uri === '/') {
        if (req.method === 'GET') return getOrdersList();
        if (req.method === 'POST') {
          const createdItem = createOrder(await drainJson(req));
          res.statusCode = 201;
          res.setHeader('Access-Control-Expose-Headers', 'Location');
          res.setHeader('Location', `${URI}/${createdItem.id}`);
          return createdItem;
        }
      }
      return null;
    })();
    res.end(JSON.stringify(body));
  } catch (err) {
    // обрабатываем сгенерированную нами же ошибку
    if (err instanceof ApiError) {
      res.writeHead(err.statusCode);
      res.end(JSON.stringify(err.data));
    } else {
      // если что-то пошло не так - пишем об этом в консоль и возвращаем 500 ошибку сервера
      res.statusCode = 500;
      res.end(JSON.stringify({message: 'Server Error'}));
      console.error(err);
    }
  }
})
  // выводим инструкцию, как только сервер запустился...
  .on('listening', () => {
    if (process.env.NODE_ENV !== 'test') {
      console.log(`Сервер CRM запущен. Вы можете использовать его по адресу http://localhost:${PORT}`);
      console.log('Нажмите CTRL+C, чтобы остановить сервер');
      console.log('Доступные методы:');
      console.log(`GET ${URI} - получить список заказов`);
      console.log(`POST ${URI} - создать заказ, в теле запроса нужно передать объект {name: string, surname: string, tel: string}`);
    }
  })
  // ...и вызываем запуск сервера на указанном порту
  .listen(PORT);
