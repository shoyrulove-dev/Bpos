const mongoose = require('mongoose');
const OrderModel = require('../models/Order');

(async () => {
  try {
    // Kết nối tới cơ sở dữ liệu
    await mongoose.connect('mongodb://localhost:27017/bpos', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('Đã kết nối tới cơ sở dữ liệu');

    // Tìm đơn hàng với shortId là 72621474
    const order = await OrderModel.findOne({ shortId: '72621474' });

    if (!order) {
      console.log('Không tìm thấy đơn hàng với ID 72621474');
    } else {
      console.log('Thông tin đơn hàng:', order);
    }

    // Đóng kết nối
    await mongoose.connection.close();
  } catch (error) {
    console.error('Lỗi khi kiểm tra trạng thái đơn hàng:', error);
  }
})();