const port = process.env.PORT || 3000; // Render сам скажет, какой порт использовать
const io = require("socket.io")(port, {
    cors: {
        origin: "*", // Разрешаем доступ всем (вашему сайту с чатом)
        methods: ["GET", "POST"]
    }
});

console.log(`📡 Сигнальный сервер запущен на порту ${port}`);

io.on("connection", (socket) => {
    console.log("Новое подключение:", socket.id);

    // --- ЛОГИКА СИГНАЛИЗАЦИИ (СВАХА) ---
    
    // 1. Клиент А отправляет свои координаты (Offer)
    socket.on("offer", (data) => {
        // data.target_id - это socket.id получателя (или его room)
        socket.to(data.target_id).emit("offer", {
            sdp: data.sdp,
            sender_id: socket.id
        });
    });

    // 2. Клиент Б отвечает (Answer)
    socket.on("answer", (data) => {
        socket.to(data.target_id).emit("answer", {
            sdp: data.sdp,
            sender_id: socket.id
        });
    });

    // 3. Обмен ICE кандидатами (пути в сети)
    socket.on("ice-candidate", (data) => {
        socket.to(data.target_id).emit("ice-candidate", data.candidate);
    });

    // 4. (Для теста) Простое перенаправление сообщений
    socket.on("join_room", (room) => {
        socket.join(room);
        console.log(`Socket ${socket.id} зашел в комнату ${room}`);
    });
    
    socket.on("message", (data) => {
        // Отправить всем в комнате, кроме меня
        socket.to(data.room).emit("message", data.msg);
    });
});
