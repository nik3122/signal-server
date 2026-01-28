<?php
require 'db.php';
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *'); // Разрешаем запросы

// Получаем JSON данные от JS
$input = file_get_contents('php://input');
$data = json_decode($input, true);

if (!$data) {
    echo json_encode(['status' => 'error', 'message' => 'No data received']);
    exit;
}

$action = $data['action'] ?? '';

try {
    // --- 1. РЕГИСТРАЦИЯ ---
    if ($action === 'register') {
        $u = trim($data['username']);
        $p = password_hash(trim($data['password']), PASSWORD_DEFAULT);

        // Проверка на дубликат имени
        $stmt = $pdo->prepare("SELECT id FROM users WHERE username = ?");
        $stmt->execute([$u]);
        if ($stmt->fetch()) {
            echo json_encode(['status' => 'error', 'message' => 'Имя пользователя уже занято']);
            exit;
        }

        $stmt = $pdo->prepare("INSERT INTO users (username, password) VALUES (?, ?)");
        $stmt->execute([$u, $p]);
        echo json_encode(['status' => 'success']);
        exit;
    }

    // --- 2. ВХОД ---
    if ($action === 'login') {
        $stmt = $pdo->prepare("SELECT * FROM users WHERE username = ?");
        $stmt->execute([$data['username']]);
        $user = $stmt->fetch();

        if ($user && password_verify($data['password'], $user['password'])) {
            unset($user['password']); // Убираем хеш перед отправкой
            echo json_encode(['status' => 'success', 'user' => $user]);
        } else {
            echo json_encode(['status' => 'error', 'message' => 'Неверный логин или пароль']);
        }
        exit;
    }

    // --- 3. ПОЛУЧИТЬ КОНТАКТЫ (ДРУЗЕЙ) ---
    if ($action === 'get_contacts') {
        $my_id = $data['my_id'];
        
        // Выбираем друзей и считаем количество непрочитанных сообщений от них
        $sql = "SELECT u.id, u.username, u.avatar,
                (SELECT COUNT(*) FROM messages m 
                 WHERE m.sender_id = u.id 
                 AND m.receiver_id = ? 
                 AND m.is_read = 0) as unread_count
                FROM users u 
                JOIN friends f ON u.id = f.friend_id 
                WHERE f.user_id = ?";
        
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$my_id, $my_id]);
        echo json_encode($stmt->fetchAll());
        exit;
    }

    // --- 4. ДОБАВИТЬ ДРУГА ---
    if ($action === 'add_friend') {
        $my_id = $data['my_id'];
        $friend_name = trim($data['friend_name']);

        // Ищем ID друга по имени
        $stmt = $pdo->prepare("SELECT id FROM users WHERE username = ?");
        $stmt->execute([$friend_name]);
        $friend = $stmt->fetch();

        if (!$friend) {
            echo json_encode(['status' => 'error', 'message' => 'Пользователь не найден']);
            exit;
        }
        if ($friend['id'] == $my_id) {
            echo json_encode(['status' => 'error', 'message' => 'Нельзя добавить себя']);
            exit;
        }

        // Добавляем связь в обе стороны
        try {
            $pdo->prepare("INSERT INTO friends (user_id, friend_id) VALUES (?, ?)")->execute([$my_id, $friend['id']]);
            $pdo->prepare("INSERT INTO friends (user_id, friend_id) VALUES (?, ?)")->execute([$friend['id'], $my_id]);
            echo json_encode(['status' => 'success']);
        } catch (Exception $e) {
            echo json_encode(['status' => 'error', 'message' => 'Пользователь уже в списке друзей']);
        }
        exit;
    }

    // --- 5. ПОЛУЧИТЬ ИСТОРИЮ ЧАТА ---
    if ($action === 'get_chat') {
        $my_id = $data['my_id'];
        $other_id = $data['other_id'];

        // Помечаем сообщения как прочитанные
        $pdo->prepare("UPDATE messages SET is_read = 1 WHERE sender_id = ? AND receiver_id = ?")
            ->execute([$other_id, $my_id]);

        // Загружаем сообщения
        $stmt = $pdo->prepare("SELECT * FROM messages 
            WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?) 
            ORDER BY created_at ASC");
        $stmt->execute([$my_id, $other_id, $other_id, $my_id]);
        
        echo json_encode(['messages' => $stmt->fetchAll()]);
        exit;
    }

    // --- 6. СОХРАНИТЬ СООБЩЕНИЕ (ИСТОРИЯ) ---
    // Это сообщение уже улетело через Socket.io, но нам нужно сохранить его в БД
    if ($action === 'send_message') {
        $stmt = $pdo->prepare("INSERT INTO messages (sender_id, receiver_id, message, type) VALUES (?, ?, ?, ?)");
        $res = $stmt->execute([$data['sender_id'], $data['receiver_id'], $data['message'], $data['type']]);
        
        if($res) echo json_encode(['status' => 'success']);
        else echo json_encode(['status' => 'error']);
        exit;
    }

} catch (PDOException $e) {
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
}
?>
