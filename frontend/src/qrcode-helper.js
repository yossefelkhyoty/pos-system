// QR Code Helper - يعمل مع أو بدون مكتبة QRCode
// Helper function to create QR Code with fallback

/**
 * إنشاء QR Code مع fallback
 * @param {string} data - البيانات المراد تحويلها لـ QR Code
 * @param {HTMLElement} container - العنصر الذي سيحتوي QR Code
 * @param {Object} options - خيارات إضافية
 */
async function createQRCodeWithFallback(data, container, options = {}) {
  const width = options.width || 200;
  const margin = options.margin || 2;

  // محاولة استخدام مكتبة QRCode
  if (typeof QRCode !== 'undefined') {
    try {
      const canvas = document.createElement('canvas');
      await new Promise((resolve, reject) => {
        QRCode.toCanvas(canvas, data, {
          width: width,
          margin: margin,
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          }
        }, (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });

      container.innerHTML = '';
      container.appendChild(canvas);
      return true;
    } catch (error) {
      console.warn('QRCode library failed, using API fallback:', error);
    }
  }

  // Fallback: استخدام API خارجي
  const qrImage = document.createElement('img');
  qrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=${width}x${width}&data=${encodeURIComponent(data)}`;
  qrImage.alt = 'QR Code';
  qrImage.style.maxWidth = '100%';
  qrImage.style.height = 'auto';

  qrImage.onerror = () => {
    // إذا فشل API أيضاً، اعرض النص
    container.innerHTML = `
      <div style="text-align: center; padding: 20px; border: 2px solid #000;">
        <p style="font-weight: bold; margin-bottom: 10px;">QR Code</p>
        <p style="font-family: monospace; font-size: 14px; word-break: break-all;">${data}</p>
        <p style="margin-top: 10px; font-size: 12px; color: #666;">السيريال نمبر</p>
      </div>
    `;
  };

  container.innerHTML = '';
  container.appendChild(qrImage);
  return false;
}

/**
 * طباعة QR Code كاستيكر
 * @param {string} data - البيانات
 * @param {string} productName - اسم المنتج
 * @param {string} serialNumber - السيريال نمبر
 */
function printQRStickerWithFallback(data, productName, serialNumber) {
  const printWindow = window.open('', '_blank');

  printWindow.document.write(`
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <title>استيكر - ${productName}</title>
      <style>
        @media print {
          @page {
            size: 50mm 30mm;
            margin: 2mm;
          }
          body {
            margin: 0;
            padding: 0;
          }
        }
        body {
          font-family: 'Arial', sans-serif;
          text-align: center;
          padding: 5mm;
          margin: 0;
          width: 46mm;
          height: 26mm;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
        }
        #qrcode {
          margin: 2mm 0;
        }
        #qrcode img, #qrcode canvas {
          max-width: 100%;
          height: auto;
        }
        .product-name {
          font-size: 10px;
          font-weight: bold;
          margin: 2mm 0;
          word-break: break-word;
        }
        .serial {
          font-size: 8px;
          color: #666;
        }
      </style>
    </head>
    <body>
      <div id="qrcode"></div>
      <div class="product-name">${productName}</div>
      <div class="serial">${serialNumber}</div>
      <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"></script>
      <script>
        (function() {
          const data = ${JSON.stringify(data)};
          const qrDiv = document.getElementById('qrcode');
          
          if (typeof QRCode !== 'undefined') {
            const canvas = document.createElement('canvas');
            QRCode.toCanvas(canvas, data, {
              width: 120,
              margin: 1
            }, function(error) {
              if (error) {
                qrDiv.innerHTML = '<img src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=' + encodeURIComponent(data) + '" alt="QR Code">';
              } else {
                qrDiv.innerHTML = '';
                qrDiv.appendChild(canvas);
              }
              setTimeout(() => {
                window.print();
                window.close();
              }, 500);
            });
          } else {
            qrDiv.innerHTML = '<img src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=' + encodeURIComponent(data) + '" alt="QR Code" onload="setTimeout(function(){window.print();window.close();}, 500)">';
          }
        })();
      </script>
    </body>
    </html>
  `);

  printWindow.document.close();
}
/**
 * طباعة باركود (1D) كاستيكر
 * @param {Object} product - بيانات المنتج
 */
function printBarcodeSticker(product) {
  const printWindow = window.open('', '_blank');

  printWindow.document.write(`
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <title>استيكر - ${product.name}</title>
      <style>
        @media print {
          @page {
            size: 38mm 25mm;
            margin: 0;
          }
          body { margin: 0; padding: 0; }
        }
        body {
          font-family: 'Arial', sans-serif;
          text-align: center;
          padding: 0.5mm;
          margin: 0;
          width: 38mm;
          height: 25mm;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          box-sizing: border-box;
          overflow: hidden;
        }
        #barcode {
          width: 100%;
          max-height: 11mm;
          margin-bottom: 0.5mm;
        }
        .serial-number {
          font-size: 14px;
          font-weight: bold;
          margin: 0.5mm 0;
        }
        .date-text {
          font-size: 11px;
          font-weight: bold;
          margin: 0.5mm 0;
        }
        .product-name {
          font-size: 12px;
          font-weight: bold;
          margin: 0.5mm 0 0 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          width: 100%;
        }
      </style>
    </head>
    <body>
      <svg id="barcode"></svg>
      <div class="serial-number" id="serialText"></div>
      <div class="product-name">${product.name}</div>
      <div class="date-text" id="dateText"></div>

      <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
      <script>
        (function() {
          const product = ${JSON.stringify(product)};
          const serial = (product.serial_number || "").trim();
          const productName = product.name || "منتج";
          
          window.onload = function() {
            if (!serial) {
              document.body.innerHTML = '<div style="color: red; padding: 20px;"><h3>خطأ: لا يوجد رقم تسلسلي (Serial) لهذا الصنف</h3><button onclick="window.close()">إغلاق</button></div>';
              return;
            }

            try {
              if (typeof JsBarcode === 'undefined') {
                throw new Error("لم يتم تحميل مكتبة الباركود (JsBarcode). تأكد من وجود اتصال بالإنترنت.");
              }

              JsBarcode("#barcode", serial, {
                format: "CODE128",
                width: 1.5,
                height: 35,
                displayValue: false,
                margin: 1
              });

              // عرض السيريال نمبر والتاريخ
              const today = new Date();
              const dateStr = today.getFullYear() + '/' + 
                             String(today.getMonth() + 1).padStart(2, '0') + '/' + 
                             String(today.getDate()).padStart(2, '0');
              
              document.getElementById('serialText').textContent = serial;
              document.getElementById('dateText').textContent = dateStr;

              setTimeout(() => {
                window.print();
                setTimeout(() => window.close(), 1000);
              }, 500);
            } catch (e) {
              console.error("Barcode Generation Error:", e);
              document.body.innerHTML = \`
                <div style="color: red; padding: 20px; text-align: right;" dir="rtl">
                  <h3>خطأ في إنشاء الباركود</h3>
                  <p>صنف: \${productName}</p>
                  <p>سيريال: \${serial}</p>
                  <p>التفاصيل: \${e.message || e}</p>
                  <button onclick="window.close()" style="padding: 10px; margin-top: 10px;">إغلاق</button>
                </div>
              \`;
            }
          };
        })();
      </script>
    </body>
    </html>
  `);

  printWindow.document.close();
}

/**
 * طباعة استيكر مدمج (QR Code + Barcode)
 * @param {Object} product - بيانات المنتج
 */
function printCombinedSticker(product) {
  const printWindow = window.open('', '_blank');

  printWindow.document.write(`
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <title>استيكر مدمج - ${product.name}</title>
      <style>
        @media print {
          @page {
            size: 38mm 25mm;
            margin: 0;
          }
          body { margin: 0; padding: 0; }
        }
        body {
          font-family: 'Arial', sans-serif;
          text-align: center;
          padding: 0.5mm;
          margin: 0;
          width: 38mm;
          height: 25mm;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          box-sizing: border-box;
          overflow: hidden;
        }
        .header-info {
          width: 100%;
          display: flex;
          justify-content: center;
          align-items: center;
          margin-bottom: 0.5mm;
          box-sizing: border-box;
        }
        .product-name {
          font-size: 12px;
          font-weight: bold;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 100%;
          text-align: center;
        }
        .middle-section {
          width: 100%;
          display: flex;
          justify-content: space-around;
          align-items: center;
          flex: 1;
        }
        #qrcode {
          width: 12mm;
          height: 12mm;
        }
        #barcode-container {
          width: 22mm;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        #barcode {
          width: 100%;
          height: 12mm;
        }
        .qty-info {
          font-size: 11px;
          font-weight: bold;
          margin-top: 0.5mm;
          text-align: center;
        }
      </style>
    </head>
    <body>
      <div class="header-info">
        <div class="product-name">${product.name}</div>

      </div>
      <div class="middle-section">
        <div id="qrcode"></div>
        <div id="barcode-container">
          <svg id="barcode"></svg>
        </div>
      </div>
      <div class="qty-info">${product.serial_number}</div>

      <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
      <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
      <script>
        (function() {
          const product = ${JSON.stringify(product)};
          const serial = (product.serial_number || "").trim();
          
          window.onload = function() {
            if (!serial) {
              document.body.innerHTML = '<h3>خطأ: السيريال مفقود</h3>';
              return;
            }

            // Generate QR Code
            if (typeof QRCode !== 'undefined') {
              new QRCode(document.getElementById("qrcode"), {
                text: serial,
                width: 45,
                height: 45
              });
            } else {
              document.getElementById("qrcode").innerHTML = '<img src="https://api.qrserver.com/v1/create-qr-code/?size=45x45&data=' + encodeURIComponent(serial) + '">';
            }

            // Generate Barcode
            try {
              JsBarcode("#barcode", serial, {
                format: "CODE128",
                width: 1,
                height: 35,
                displayValue: false,
                margin: 0
              });
            } catch (e) {
              console.error(e);
            }

            setTimeout(() => {
              window.print();
              setTimeout(() => window.close(), 1000);
            }, 500);
          };
        })();
      </script>
    </body>
    </html>
  `);

  printWindow.document.close();
}
/**
 * طباعة استيكر العميل مع بيانات المحل
 * @param {string} customerName - اسم العميل
 * @param {string} shopOwner - اسم صاحب المحل
 * @param {string} shopName - اسم المحل
 */
function printCustomerSticker(customerName, shopOwner, shopName) {
  const printWindow = window.open('', '_blank');

  printWindow.document.write(`
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <title>استيكر عميل</title>
      <style>
        @media print {
          @page {
            size: 38mm 25mm;
            margin: 0;
          }
          body { margin: 0; padding: 0; }
        }
        body {
          font-family: 'Arial', sans-serif;
          text-align: right;
          padding: 1mm;
          margin: 0;
          width: 38mm;
          height: 25mm;
          display: flex;
          flex-direction: column;
          justify-content: center;
          box-sizing: border-box;
          overflow: hidden;
        }
        .line {
          font-size: 14px;
          font-weight: bold;
          white-space: nowrap;
          margin: 1mm 0;
          text-align: center;
        }
      </style>
    </head>
    <body>
      <div class="line">اسم العميل: ${customerName}</div>
      <div class="line">اسم المحل: ${shopName}</div>
      <script>
        window.onload = function() {
          window.print();
          setTimeout(() => window.close(), 1000);
        };
      </script>
    </body>
    </html>
  `);

  printWindow.document.close();
}

/**
 * طباعة استيكر استلام (صيانة/عطل)
 * @param {Object} data - بيانات الاستلام
 */
function printReceiptSticker(data) {
  const printWindow = window.open('', '_blank');

  printWindow.document.write(`
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <title>استيكر استلام</title>
      <style>
        @media print {
          @page {
            size: 38mm 25mm;
            margin: 0;
          }
          body { margin: 0; padding: 0; }
        }
        body {
          font-family: 'Arial', sans-serif;
          width: 38mm;
          height: 25mm;
          display: flex;
          direction: rtl;
          margin: 0;
          padding: 0;
          box-sizing: border-box;
          border: 1px solid #000;
          overflow: hidden;
        }
        .main-content {
          flex: 2.8;
          display: flex;
          flex-direction: column;
          height: 100%;
        }
        .sidebar {
  flex: 1.2;
  display: flex;
  height: 100%;
  border-right: 1px solid #000;
}
  .side-row {
  display: flex;
  width: 100%;
  height: 100%;
}

.side-cell {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 900;
  border-left: 1px solid #000;
  box-sizing: border-box;
}

.side-cell:first-child {
  border-left: none;
}

.rotated-text {
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  white-space: nowrap;
}

        .row {
          flex: 1;
          display: flex;
          align-items: center;
          padding: 0 4px;
          border-bottom: 1px solid #000;
          font-size: 12px;
          font-weight: 900;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .row:last-child {
          border-bottom: none;
        }
        .label {
          color: #000;
          margin-left: 2px;
          flex-shrink: 0;
        }
        .text-value {
          overflow: hidden;
          text-overflow: ellipsis;
          text-align: center;
          justify-content: center;
        }
        .store-row {
          justify-content: center;
          font-size: 14px;
          font-weight: 900;
        }
        .sidebar-box {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          border-bottom: 1px solid #000;
          font-size: 10px;
          font-weight: 900;
          padding: 2px;
          text-align: center;
        }
        .sidebar-box:last-child {
          border-bottom: none;
        }
          .password-cell {
  border-right: 1px solid #000;
}
        .rotated-text {
          writing-mode: vertical-rl;
          transform: rotate(180deg);
          white-space: nowrap;
        }
      </style>
    </head>
    <body>
      <div class="main-content">
        <div class="row store-row">${data.personName}</div>
        <div class="row store-row">${data.fault}</div>
        <div class="row store-row">${data.faultExtra}</div>
        <div class="row store-row">جداوي ستور</div>
      </div>
      <div class="sidebar">
        <div class="side-row">
          <div class="side-cell rotated-text">${data.receiveDate}</div>
          <div class="side-cell password-cell rotated-text">${data.password}</div>
        </div>
      </div>

      <script>
        window.onload = function() {
          window.print();
          setTimeout(() => window.close(), 1000);
        };
      </script>
    </body>
    </html>
  `);

  printWindow.document.close();
}
