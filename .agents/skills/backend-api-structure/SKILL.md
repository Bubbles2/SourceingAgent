---
name: backend-api-structure
description:Use this skill whenever creating, extending, or reorganizing a backend REST API.
version: 1.0.0
last_updated: 2026-06-16
---

Purpose

Use this skill whenever creating, extending, or reorganizing a backend REST API.

The backend should use a simple, predictable, domain-based structure where API endpoints are easy to find from the URL itself.

The preferred stack is:

Node.js
Express
JavaScript or TypeScript
PostgreSQL or another relational database

The same structural principles should still be applied when another database or persistence layer is used.

Core Principle

Organize the backend by business domain, not by technical layer.

Each API business area should have its own folder.

For example:

server/
└── src/
    ├── api/
    │   ├── books/
    │   ├── customers/
    │   ├── orders/
    │   └── products/
    │
    ├── config/
    └── app.js

There should be a clear relationship between the URL and the filesystem.

/api/books       → src/api/books/
/api/customers   → src/api/customers/
/api/orders      → src/api/orders/
/api/products    → src/api/products/

A developer should be able to look at an endpoint URL and immediately know where its implementation is located.

Required Domain Structure

Each API domain should normally contain at least:

src/api/books/
├── index.js
└── booksController.js

Or with TypeScript:

src/api/books/
├── index.ts
└── booksController.ts

The responsibilities are:

index
    Defines routes
    Maps HTTP methods and paths to controller functions

controller
    Implements the endpoint behaviour
    Reads request parameters/body
    Performs validation
    Calls database or service code
    Returns the HTTP response

Do not put substantial business or database logic directly inside index.js.

Route File

The domain index.js is the entry point for the domain API.

Its main purpose is to show:

Which endpoints exist.
Which HTTP method each endpoint uses.
Which controller function handles the endpoint.

Example:

const express = require("express");
const booksController = require("./booksController");

const router = express.Router();

router.get("/", booksController.index);
router.get("/:id", booksController.get);
router.post("/", booksController.create);
router.put("/:id", booksController.update);
router.delete("/:id", booksController.remove);

module.exports = router;

Opening this file should immediately reveal the public API for the domain.

For example:

GET     /books
GET     /books/:id
POST    /books
PUT     /books/:id
DELETE  /books/:id
Controller File

The controller implements the functions referenced by the route file.

Example:

const index = async (req, res, next) => {
  try {
    const books = [];

    res.json(books);
  } catch (error) {
    next(error);
  }
};

const get = async (req, res, next) => {
  try {
    const { id } = req.params;

    const book = {
      id,
    };

    res.json(book);
  } catch (error) {
    next(error);
  }
};

const create = async (req, res, next) => {
  try {
    const data = req.body;

    const createdBook = data;

    res.status(201).json(createdBook);
  } catch (error) {
    next(error);
  }
};

const update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = req.body;

    res.json({
      id,
      ...data,
    });
  } catch (error) {
    next(error);
  }
};

const remove = async (req, res, next) => {
  try {
    const { id } = req.params;

    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  index,
  get,
  create,
  update,
  remove,
};

Keep controller functions small and easy to follow.

Registering Domain APIs

The main Express application registers each domain router.

Example:

const express = require("express");

const booksApi = require("./api/books");
const customersApi = require("./api/customers");
const ordersApi = require("./api/orders");

const app = express();

app.use(express.json());

app.use("/api/books", booksApi);
app.use("/api/customers", customersApi);
app.use("/api/orders", ordersApi);

module.exports = app;

The final URL is created by combining the path registered in app.js with the path defined in the domain index.js.

Example:

app.use("/api/books", booksApi);

combined with:

router.get("/:id", booksController.get);

creates:

GET /api/books/:id
Request Flow

Always preserve a simple request flow:

HTTP request
    ↓
app.js
    ↓
domain index.js
    ↓
controller function
    ↓
service/database/model
    ↓
controller
    ↓
JSON HTTP response

For example:

GET /api/books/42
        ↓
app.use("/api/books", booksApi)
        ↓
src/api/books/index.js
        ↓
router.get("/:id", booksController.get)
        ↓
booksController.get()
        ↓
database/service
        ↓
JSON response

This flow should remain obvious when reading the source code.

Endpoint Discovery Rule

Endpoint discovery is a major design requirement.

Given:

GET /api/books/42

a developer should be able to locate the implementation using:

/api/books
    ↓
src/api/books/
    ↓
index.js
    ↓
router.get("/:id", booksController.get)
    ↓
booksController.js
    ↓
get()

Avoid architectures where finding one endpoint requires searching across many unrelated folders.

Recommended Server Structure

Use the following as the default structure:

server/
├── src/
│   ├── api/
│   │   ├── books/
│   │   │   ├── index.js
│   │   │   └── booksController.js
│   │   │
│   │   ├── customers/
│   │   │   ├── index.js
│   │   │   └── customersController.js
│   │   │
│   │   ├── orders/
│   │   │   ├── index.js
│   │   │   └── ordersController.js
│   │   │
│   │   └── products/
│   │       ├── index.js
│   │       └── productsController.js
│   │
│   ├── config/
│   │   └── db.js
│   │
│   ├── middleware/
│   │
│   └── app.js
│
├── .env
├── package.json
└── README.md

Do not create additional layers unless they provide a clear benefit.

Prefer a simple structure over an unnecessarily abstract architecture.

Services

If controller logic becomes substantial, introduce a service file inside the same domain.

Example:

src/api/books/
├── index.js
├── booksController.js
└── booksService.js

The responsibility becomes:

index.js
    routes

booksController.js
    HTTP request and response handling

booksService.js
    business logic

Example:

const booksService = require("./booksService");

const get = async (req, res, next) => {
  try {
    const book = await booksService.getBook(req.params.id);

    if (!book) {
      return res.status(404).json({
        error: "Book not found",
      });
    }

    res.json(book);
  } catch (error) {
    next(error);
  }
};

Do not create a service layer automatically for trivial CRUD operations.

Add it when it improves readability or reuse.

Models and Database Access

Database access should not be hidden in unrelated folders.

When models are domain-specific, prefer keeping their usage clearly associated with the domain.

Possible structure:

src/api/books/
├── index.js
├── booksController.js
├── booksService.js
└── bookModel.js

If the project uses a shared ORM model directory, that is also acceptable:

src/
├── api/
│   └── books/
│       ├── index.js
│       ├── booksController.js
│       └── booksService.js
│
└── models/
    └── Book.js

Whichever approach is used, endpoint discovery must remain straightforward.

Controller Naming Convention

For standard CRUD APIs, prefer consistent function names:

index
get
create
update
remove

Meaning:

index   → return a collection
get     → return one resource
create  → create a resource
update  → update a resource
remove  → delete a resource

Example:

router.get("/", controller.index);
router.get("/:id", controller.get);
router.post("/", controller.create);
router.put("/:id", controller.update);
router.delete("/:id", controller.remove);

For domain-specific operations, use clear action names.

Example:

router.post("/:id/approve", controller.approve);
router.post("/:id/cancel", controller.cancel);
router.get("/:id/history", controller.history);
REST Conventions

Prefer resource-oriented URLs.

Good:

GET    /api/books
GET    /api/books/:id
POST   /api/books
PUT    /api/books/:id
DELETE /api/books/:id

Avoid unnecessary verbs in URLs such as:

/getBooks
/createBook
/deleteBook
/updateBook

The HTTP method should normally communicate the action.

Domain-specific operations are acceptable when they represent real business actions:

POST /api/orders/:id/approve
POST /api/orders/:id/cancel
POST /api/invoices/:id/send
Error Handling

Controllers should use consistent error handling.

Prefer:

const get = async (req, res, next) => {
  try {
    // logic
  } catch (error) {
    next(error);
  }
};

Use central Express error middleware for unexpected errors.

Example:

app.use((error, req, res, next) => {
  console.error(error);

  res.status(500).json({
    error: "An unexpected server error occurred.",
  });
});

Return appropriate HTTP status codes.

Typical examples:

200 OK
201 Created
204 No Content
400 Bad Request
401 Unauthorized
403 Forbidden
404 Not Found
409 Conflict
500 Internal Server Error
Configuration

Do not hardcode environment-specific configuration.

Use environment variables for values such as:

PORT
DB_HOST
DB_PORT
DB_NAME
DB_USER
DB_PASSWORD
API keys
external service URLs

Database configuration should normally live under: