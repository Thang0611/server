/*M!999999\- enable the sandbox mode */ 
-- MariaDB dump 10.19  Distrib 10.6.22-MariaDB, for debian-linux-gnu (x86_64)
--
-- Host: localhost    Database: udemy_bot
-- ------------------------------------------------------
-- Server version	10.6.22-MariaDB-0ubuntu0.22.04.1

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `download_tasks`
--

DROP TABLE IF EXISTS `download_tasks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `download_tasks` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `order_id` int(10) unsigned DEFAULT NULL,
  `email` varchar(255) NOT NULL,
  `phone_number` varchar(20) DEFAULT NULL,
  `course_url` text NOT NULL,
  `title` varchar(255) DEFAULT NULL,
  `price` decimal(15,0) NOT NULL DEFAULT 0 COMMENT 'Giá bán thực tế của khóa này trong đơn hàng',
  `status` enum('paid','pending','processing','enrolled','completed','failed') DEFAULT 'pending',
  `drive_link` text DEFAULT NULL,
  `retry_count` int(11) DEFAULT 0,
  `error_log` text DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `order_id` (`order_id`),
  CONSTRAINT `download_tasks_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=50 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `download_tasks`
--

LOCK TABLES `download_tasks` WRITE;
/*!40000 ALTER TABLE `download_tasks` DISABLE KEYS */;
INSERT INTO `download_tasks` VALUES (45,43,'test.enrollment@example.com',NULL,'https://samsungu.udemy.com/course/prompt-engineering-for-work/','Prompt Engineering for Work',0,'completed','https://drive.google.com/drive/folders/1-kVk-rzB2XDLBS-glmxnyv-IlhQKI-DV',0,NULL,'2026-01-13 09:59:35','2026-01-13 10:02:30'),(46,44,'dobachkhoa2k1@gmail.com',NULL,'https://samsungu.udemy.com/course/ocp11_from_oca8/','Advanced Java, Explained Simply: Java 8–25 and Spring Boot 3',2000,'completed','https://drive.google.com/drive/folders/1eXkVA90qpz0IdPG9u1YNGx41kBOqlJXk',0,NULL,'2026-01-13 10:09:36','2026-01-13 11:04:45'),(47,45,'19d140071@gmail.com',NULL,'https://samsungu.udemy.com/course/30-days-of-code-the-complete-python-bootcamp-vietnamese/','Lập Trình Python Từ Cơ Bản Đến Nâng Cao Trong 30 Ngày',2000,'completed','https://drive.google.com/drive/folders/1DIVQyOKAMbbKWlwZ-hMknhTN-U1x1oOI',0,NULL,'2026-01-13 12:24:03','2026-01-13 12:46:09'),(48,46,'dobachkhoa2k1@gmail.com',NULL,'https://samsungu.udemy.com/course/intro-to-large-language-models-llms/','Intro to Large Language Models (LLMs)',2000,'completed','https://drive.google.com/drive/folders/1C26tXxGSCGAubOVyT7bVXM-tLQfMhw9Z',0,NULL,'2026-01-13 14:11:59','2026-01-13 14:18:32'),(49,47,'Nguyenhuuthanga3@gmail.com',NULL,'https://samsungu.udemy.com/course/business-data-analysis-using-microsoft-power-bi/','Power BI - Business Intelligence for Beginners to Advance',2000,'paid',NULL,0,NULL,'2026-01-13 14:51:35','2026-01-13 14:51:35');
/*!40000 ALTER TABLE `download_tasks` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `orders`
--

DROP TABLE IF EXISTS `orders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `orders` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `order_code` varchar(50) NOT NULL,
  `user_email` varchar(255) NOT NULL,
  `total_amount` decimal(15,0) NOT NULL DEFAULT 0,
  `payment_status` enum('pending','paid','cancelled','refunded') DEFAULT 'pending',
  `payment_gateway_data` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`payment_gateway_data`)),
  `note` text DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `order_code` (`order_code`),
  UNIQUE KEY `order_code_2` (`order_code`),
  UNIQUE KEY `order_code_3` (`order_code`),
  UNIQUE KEY `order_code_4` (`order_code`),
  UNIQUE KEY `order_code_5` (`order_code`),
  UNIQUE KEY `order_code_6` (`order_code`),
  UNIQUE KEY `order_code_7` (`order_code`),
  UNIQUE KEY `order_code_8` (`order_code`),
  UNIQUE KEY `order_code_9` (`order_code`),
  UNIQUE KEY `order_code_10` (`order_code`),
  UNIQUE KEY `order_code_11` (`order_code`),
  UNIQUE KEY `order_code_12` (`order_code`),
  UNIQUE KEY `order_code_13` (`order_code`),
  UNIQUE KEY `order_code_14` (`order_code`),
  UNIQUE KEY `order_code_15` (`order_code`),
  UNIQUE KEY `order_code_16` (`order_code`),
  UNIQUE KEY `order_code_17` (`order_code`),
  UNIQUE KEY `order_code_18` (`order_code`),
  UNIQUE KEY `order_code_19` (`order_code`),
  UNIQUE KEY `order_code_20` (`order_code`),
  UNIQUE KEY `order_code_21` (`order_code`),
  UNIQUE KEY `order_code_22` (`order_code`),
  UNIQUE KEY `order_code_23` (`order_code`),
  UNIQUE KEY `order_code_24` (`order_code`),
  UNIQUE KEY `order_code_25` (`order_code`),
  UNIQUE KEY `order_code_26` (`order_code`),
  UNIQUE KEY `order_code_27` (`order_code`),
  UNIQUE KEY `order_code_28` (`order_code`),
  UNIQUE KEY `order_code_29` (`order_code`),
  UNIQUE KEY `order_code_30` (`order_code`),
  UNIQUE KEY `order_code_31` (`order_code`),
  UNIQUE KEY `order_code_32` (`order_code`),
  UNIQUE KEY `order_code_33` (`order_code`),
  UNIQUE KEY `order_code_34` (`order_code`),
  UNIQUE KEY `order_code_35` (`order_code`),
  UNIQUE KEY `order_code_36` (`order_code`),
  UNIQUE KEY `order_code_37` (`order_code`),
  UNIQUE KEY `order_code_38` (`order_code`),
  UNIQUE KEY `order_code_39` (`order_code`),
  UNIQUE KEY `order_code_40` (`order_code`),
  UNIQUE KEY `order_code_41` (`order_code`),
  UNIQUE KEY `order_code_42` (`order_code`),
  UNIQUE KEY `order_code_43` (`order_code`),
  UNIQUE KEY `order_code_44` (`order_code`),
  UNIQUE KEY `order_code_45` (`order_code`),
  UNIQUE KEY `order_code_46` (`order_code`),
  UNIQUE KEY `order_code_47` (`order_code`),
  UNIQUE KEY `order_code_48` (`order_code`),
  UNIQUE KEY `order_code_49` (`order_code`),
  UNIQUE KEY `order_code_50` (`order_code`),
  UNIQUE KEY `order_code_51` (`order_code`),
  UNIQUE KEY `order_code_52` (`order_code`),
  UNIQUE KEY `order_code_53` (`order_code`),
  UNIQUE KEY `order_code_54` (`order_code`),
  UNIQUE KEY `order_code_55` (`order_code`),
  UNIQUE KEY `order_code_56` (`order_code`)
) ENGINE=InnoDB AUTO_INCREMENT=48 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `orders`
--

LOCK TABLES `orders` WRITE;
/*!40000 ALTER TABLE `orders` DISABLE KEYS */;
INSERT INTO `orders` VALUES (43,'DH375312','test.enrollment@example.com',2000,'paid','{\"gateway\":\"TPB\",\"transactionDate\":\"2026-01-13 16:00:00\",\"referenceCode\":\"FT26013123456\",\"accountNumber\":\"10001874613\",\"transferType\":\"in\",\"code\":\"DH375312\",\"content\":\"DH375312 thanh toan khoa hoc\",\"transferAmount\":2000,\"fullPayload\":{\"id\":123456,\"gateway\":\"TPB\",\"transactionDate\":\"2026-01-13 16:00:00\",\"accountNumber\":\"10001874613\",\"code\":\"DH375312\",\"content\":\"DH375312 thanh toan khoa hoc\",\"transferType\":\"in\",\"transferAmount\":2000,\"accumulated\":1000000,\"subAccount\":null,\"referenceCode\":\"FT26013123456\",\"description\":\"Test payment\"}}',NULL,'2026-01-13 09:59:35','2026-01-13 10:00:24'),(44,'DH976484','dobachkhoa2k1@gmail.com',2000,'paid','{\"gateway\":\"TPBank\",\"transactionDate\":\"2026-01-13 17:10:03\",\"referenceCode\":\"868V602260133247\",\"accountNumber\":\"10001874613\",\"transferType\":\"in\",\"code\":\"DH976484\",\"content\":\"DH976484\",\"transferAmount\":2000,\"fullPayload\":{\"gateway\":\"TPBank\",\"transactionDate\":\"2026-01-13 17:10:03\",\"accountNumber\":\"10001874613\",\"subAccount\":null,\"code\":\"DH976484\",\"content\":\"DH976484\",\"transferType\":\"in\",\"description\":\"BankAPINotify DH976484\",\"transferAmount\":2000,\"referenceCode\":\"868V602260133247\",\"accumulated\":4238793,\"id\":38704951}}',NULL,'2026-01-13 10:09:36','2026-01-13 10:10:05'),(45,'DH043061','19d140071@gmail.com',2000,'paid','{\"gateway\":\"TPBank\",\"transactionDate\":\"2026-01-13 19:24:53\",\"referenceCode\":\"868ITC1260138341\",\"accountNumber\":\"10001874613\",\"transferType\":\"in\",\"code\":\"DH043061\",\"content\":\"DH043061\",\"transferAmount\":2000,\"fullPayload\":{\"gateway\":\"TPBank\",\"transactionDate\":\"2026-01-13 19:24:53\",\"accountNumber\":\"10001874613\",\"subAccount\":null,\"code\":\"DH043061\",\"content\":\"DH043061\",\"transferType\":\"in\",\"description\":\"BankAPINotify DH043061\",\"transferAmount\":2000,\"referenceCode\":\"868ITC1260138341\",\"accumulated\":4240793,\"id\":38721520}}',NULL,'2026-01-13 12:24:03','2026-01-13 12:24:55'),(46,'DH519224','dobachkhoa2k1@gmail.com',2000,'paid','{\"gateway\":\"TPBank\",\"transactionDate\":\"2026-01-13 21:12:39\",\"referenceCode\":\"868V602260134492\",\"accountNumber\":\"10001874613\",\"transferType\":\"in\",\"code\":\"DH519224\",\"content\":\"DH519224\",\"transferAmount\":2000,\"fullPayload\":{\"gateway\":\"TPBank\",\"transactionDate\":\"2026-01-13 21:12:39\",\"accountNumber\":\"10001874613\",\"subAccount\":null,\"code\":\"DH519224\",\"content\":\"DH519224\",\"transferType\":\"in\",\"description\":\"BankAPINotify DH519224\",\"transferAmount\":2000,\"referenceCode\":\"868V602260134492\",\"accumulated\":4242793,\"id\":38733730}}',NULL,'2026-01-13 14:11:59','2026-01-13 14:12:41'),(47,'DH895352','Nguyenhuuthanga3@gmail.com',2000,'pending',NULL,NULL,'2026-01-13 14:51:35','2026-01-13 14:51:35');
/*!40000 ALTER TABLE `orders` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-01-13 22:26:12
