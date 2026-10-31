--liquibase formatted sql

--changeset james:create-users

CREATE TABLE users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_issuer text NOT NULL,
    auth_subject text NOT NULL,
    email text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (auth_issuer, auth_subject)
);

--rollback DROP TABLE users;