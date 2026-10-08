\# Seat Reservation at Scale



A production-oriented seat reservation backend built with Node.js, TypeScript, Fastify, and PostgreSQL.



The system is designed to handle concurrent reservation attempts for the same seat without double-selling, while supporting idempotency, per-user seat limits, cancellation, reconciliation, health checks, metrics, and structured request logging.



\## Tech Stack



\- Node.js

\- TypeScript

\- Fastify

\- PostgreSQL

\- `pg`

\- node-pg-migrate

\- Docker / Docker Compose

\- Render for production deployment



\## Architecture



```text

Client

&#x20; |

&#x20; v

Fastify HTTP API

&#x20; |

&#x20; +--> Authentication middleware

&#x20; |

&#x20; +--> Reservation service

&#x20; |       |

&#x20; |       +--> PostgreSQL transaction

&#x20; |       +--> Transaction-scoped advisory lock

&#x20; |       +--> Row-level seat locking

&#x20; |       +--> Idempotency validation

&#x20; |       +--> Per-user limit validation

&#x20; |

&#x20; +--> Show service

&#x20; |

&#x20; +--> Health / Metrics

&#x20; |

&#x20; v

PostgreSQL

