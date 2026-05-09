/**
 * Grab session capture script — chạy trong F12 Console trên merchant.grab.com
 *
 * CÁCH DÙNG:
 * 1. Mở merchant.grab.com, đăng nhập vào account cần lấy session
 * 2. Mở F12 > Console
 * 3. Copy toàn bộ script này paste vào Console, nhấn Enter
 * 4. Script sẽ intercept request tiếp theo đến Grab API để lấy token
 * 5. Sau đó click vào một đơn hàng bất kỳ, hoặc F5 (refresh)
 * 6. Script sẽ tự động gọi BPOS API để lưu session
 */

(async function startCapture() {
  // ===========================================================
  // CẤU HÌNH — chỉnh theo account đang đăng nhập
  // ===========================================================
  const BPOS_BASE = 'https://bposbin.vercel.app';
  const BPOS_CREDENTIALS = 'include'; // tab này phải cùng browser với BPOS đang đăng nhập

  // Map từ Grab username sang BPOS integration ID + store ID
  const ACCOUNT_MAP = {
    'ooo.tech.ds33':            { id: '69fba901ea2efd407b2e93cc', storeId: '5-C63FDBAKC7MVRX' },
    '1ketoan@takogroup.com.vn': { id: '69fba901ea2efd407b2e93ca', storeId: 'VNMG20240823094523016218' },
    'dmx.nexdor.bdt':           { id: '69fba900ea2efd407b2e93c6', storeId: '5-C2EWWAD3ECCWNX' },
  };

  // ===========================================================
  // Tự detect username từ localStorage
  // ===========================================================
  let detectedUsername = null;
  try {
    const profile = JSON.parse(localStorage.getItem('userprofileInfo') || '{}');
    detectedUsername = profile?.user_profile?.username || null;
    if (!detectedUsername) {
      const profileInfo = JSON.parse(localStorage.getItem('profileInfo') || '{}');
      detectedUsername = profileInfo?.username || null;
    }
  } catch {}
  console.log('Detected Grab username:', detectedUsername);

  const target = ACCOUNT_MAP[detectedUsername];
  if (!target) {
    console.warn(
      'Không tìm thấy integration mapping cho username:', detectedUsername,
      '\nCác username có mapping:', Object.keys(ACCOUNT_MAP).join(', ')
    );
    console.info('Nếu đúng username, thêm vào ACCOUNT_MAP trong script rồi chạy lại.');
    return;
  }
  console.log(`Targeting BPOS integration: ${target.id} (store: ${target.storeId})`);

  // ===========================================================
  // Intercept fetch để lấy Authorization header
  // ===========================================================
  const originalFetch = window.__origFetch__ || window.fetch;
  window.__origFetch__ = originalFetch;

  let capturedToken = null;
  let saveInProgress = false;

  window.fetch = async function(input, init) {
    const url = typeof input === 'string' ? input : input?.url || '';
    const isGrabApi =
      url.includes('.grab.com') ||
      url.includes('.grabtaxi.com') ||
      url.includes('grab.com/api') ||
      url.includes('grab.com/grabfood');

    if (isGrabApi && !capturedToken && !saveInProgress) {
      const headers = init?.headers || {};
      const auth =
        headers['Authorization'] ||
        headers['authorization'] ||
        headers['x-grab-access-token'] ||
        null;
      if (auth && auth.length > 40) {
        capturedToken = auth;
        console.log('✅ Token captured:', auth.slice(0, 60) + '…');
        await saveSessionToBpos(auth);
      }
    }
    return originalFetch.apply(this, arguments);
  };

  async function saveSessionToBpos(auth) {
    if (saveInProgress) return;
    saveInProgress = true;
    const jwt = auth.replace(/^Bearer\s+/i, '').trim();
    console.log('Saving session to BPOS integration', target.id, '...');
    try {
      const res = await originalFetch(
        `${BPOS_BASE}/api/integrations/${target.id}/auto-login`,
        {
          method: 'POST',
          credentials: BPOS_CREDENTIALS,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            manualJwt: jwt,
            storeId: target.storeId,
            username: detectedUsername,
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        console.log('🎉 Session saved! Expires:', data.sessionExpiresAt);
        // Restore original fetch
        window.fetch = window.__origFetch__;
        window.__origFetch__ = undefined;
      } else {
        console.error('❌ BPOS save failed:', res.status, data);
        saveInProgress = false;
      }
    } catch (e) {
      console.error('❌ Network error:', e);
      saveInProgress = false;
    }
  }

  // ===========================================================
  // Trigger một API call để kích hoạt interception
  // ===========================================================
  console.log('⏳ Intercepting started. Triggering a Grab API call...');
  try {
    // Gọi API lấy danh sách merchant (nhẹ, không side-effect)
    await window.fetch(
      'https://merchant.grab.com/grabfood/api/food/v1/merchants',
      { credentials: 'include' }
    );
  } catch {}

  // Thử một URL khác
  try {
    await window.fetch(
      'https://merchant.grab.com/troy/user-profile/v1/merchant-selector',
      { credentials: 'include' }
    );
  } catch {}

  if (!capturedToken) {
    console.info(
      '⚠️ Chưa lấy được token từ auto-trigger. Hãy click vào một đơn hàng bất kỳ hoặc F5.',
      '\nScript vẫn đang lắng nghe — token sẽ được capture khi có request tiếp theo.'
    );
  }
})();
