// Quantish Agent Documentation - JavaScript

// Toggle mobile sidebar
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.querySelector('.sidebar-overlay');
  const isOpen = sidebar.classList.toggle('open');
  if (overlay) {
    overlay.style.display = isOpen ? 'block' : 'none';
  }
  document.body.style.overflow = isOpen ? 'hidden' : '';
}

// Close sidebar
function closeSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.querySelector('.sidebar-overlay');
  sidebar.classList.remove('open');
  if (overlay) {
    overlay.style.display = 'none';
  }
  document.body.style.overflow = '';
}

// Close sidebar when clicking outside on mobile
document.addEventListener('click', function(event) {
  const sidebar = document.getElementById('sidebar');
  const menuBtn = document.querySelector('.mobile-menu-btn');
  
  if (window.innerWidth <= 900) {
    if (!sidebar.contains(event.target) && !menuBtn.contains(event.target)) {
      closeSidebar();
    }
  }
});

// Set active nav item based on current page
document.addEventListener('DOMContentLoaded', function() {
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  const navLinks = document.querySelectorAll('.nav-tree a');
  
  navLinks.forEach(link => {
    const href = link.getAttribute('href');
    if (href === currentPage) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });
});

// Copy code blocks on click
document.querySelectorAll('pre code, .terminal-command').forEach(block => {
  block.style.cursor = 'pointer';
  block.title = 'Click to copy';
  
  block.addEventListener('click', async () => {
    const text = block.textContent;
    try {
      await navigator.clipboard.writeText(text);
      
      // Visual feedback
      const originalColor = block.style.color;
      block.style.color = 'var(--green)';
      setTimeout(() => {
        block.style.color = originalColor;
      }, 200);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  });
});

// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function(e) {
    e.preventDefault();
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      target.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }
  });
});





