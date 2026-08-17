-- Optional: same dummy data in MySQL, for when you outgrow static hosting.
CREATE DATABASE IF NOT EXISTS prebilling_poc CHARACTER SET utf8mb4;
USE prebilling_poc;

DROP TABLE IF EXISTS wd_invoice_line, wd_invoice, poms_order_line, poms_order;

CREATE TABLE poms_order (
  order_no                VARCHAR(20) PRIMARY KEY,
  order_type              VARCHAR(30),
  sales_channel           VARCHAR(40),
  order_status            VARCHAR(40),
  market                  CHAR(2),
  sales_type              VARCHAR(10),
  model                   VARCHAR(40),
  model_year              SMALLINT,
  vin                     VARCHAR(20),
  orderer_company         VARCHAR(80),
  orderer_email           VARCHAR(120),
  customer_id             VARCHAR(30),
  financing_option        VARCHAR(20),
  currency                CHAR(3),
  grand_total_price       DECIMAL(12,2),
  grand_total_vat         DECIMAL(12,2),
  car_total_price         DECIMAL(12,2),
  extras_total_price      DECIMAL(12,2),
  created_at              DATETIME,
  confirmed_at            DATETIME
);

CREATE TABLE wd_invoice (
  invoice_number          VARCHAR(30) PRIMARY KEY,
  invoice_type            VARCHAR(30),
  status                  VARCHAR(20),
  company                 VARCHAR(80),
  customer                VARCHAR(80),
  customer_id             VARCHAR(30),
  sales_order             VARCHAR(20),
  po_number               VARCHAR(20),
  vin                     VARCHAR(20),
  model                   VARCHAR(40),
  invoice_date            DATE,
  due_date                DATE,
  payment_terms           VARCHAR(30),
  currency                CHAR(3),
  default_tax_code        VARCHAR(40),
  net_invoice_amount      DECIMAL(12,2),
  tax_amount              DECIMAL(12,2),
  total_invoice_amount    DECIMAL(12,2),
  amount_due              DECIMAL(12,2),
  memo                    VARCHAR(120),
  INDEX idx_sales_order (sales_order)
);

CREATE TABLE wd_invoice_line (
  invoice_number  VARCHAR(30),
  line_no         INT,
  item            VARCHAR(60),
  description     VARCHAR(80),
  quantity        INT,
  unit_price      DECIMAL(12,2),
  tax_code        VARCHAR(40),
  extended_amount DECIMAL(12,2),
  PRIMARY KEY (invoice_number, line_no)
);

CREATE TABLE poms_order_line (
  order_no        VARCHAR(20),
  line_no         INT,
  item            VARCHAR(60),
  qty             INT,
  amount_incl_vat DECIMAL(12,2),
  PRIMARY KEY (order_no, line_no)
);
