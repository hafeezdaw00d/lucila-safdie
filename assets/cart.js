class CartRemoveButton extends HTMLElement {
  constructor() {
    super();
    this.addEventListener('click', (event) => {
      event.preventDefault();
      this.closest('cart-items').updateQuantity(this.dataset.index, 0);
    });
  }
}

customElements.define('cart-remove-button', CartRemoveButton);

class CartItems extends HTMLElement {
  constructor() {
    super();
    this.closeBtn = this.querySelector('.icon-close');
    this.openBtn = document.querySelector('cart-toggle');
    this.overlay = document.querySelector('.cart-overlay');

    this.closeBtn.addEventListener('click', this.viewDrawer.bind(this));
    this.openBtn.addEventListener('click', this.viewDrawer.bind(this));
    this.overlay.addEventListener('click', this.overlayListener.bind(this));

    this.lineItemStatusElement = document.getElementById(
      'shopping-cart-line-item-status',
    );
    this.currentItemCount = Array.from(
      this.querySelectorAll('[name="updates[]"]'),
    ).reduce(
      (total, quantityInput) => total + parseInt(quantityInput.value),
      0,
    );

    this.debouncedOnChange = debounce((event) => {
      this.onChange(event);
    }, 300);

    this.addEventListener('change', this.debouncedOnChange.bind(this));
    this.cartFooter = document.getElementById('main-cart-footer');
    this.parsedId;

    this.productRecommendation = this.querySelector('cart-recommendations');
    this.openWithUrl = this.dataset.openCartWithUrl;

    if (this.openWithUrl == 'true') {
      if (location.href.includes('/cart')) {
        this.viewDrawer();
      }
    }
  }

  overlayListener() {
    if (this.overlay.classList.contains('show-overlay')) {
      this.viewDrawer();
    }
  }

  getProductRecommendation(parsedId) {
    this.parsedId = parsedId;
    const numberOfProducts = this.productRecommendation.dataset.products;
    const url = `/recommendations/products?section_id=cart-drawer&product_id=${this.parsedId}&limit=${numberOfProducts}`;

    fetch(url)
      .then((response) => response.text())
      .then((text) => {
        const html = document.createElement('div');
        html.innerHTML = text;
        const recommendations = html.querySelector('cart-recommendations');

        if (recommendations && recommendations.innerHTML.trim().length) {
          this.productRecommendation.innerHTML = recommendations.innerHTML;
        }

        if (html.querySelector('.grid__item')) {
          this.productRecommendation.classList.add(
            'product-recommendations--loaded',
          );
        }
      })
      .catch((e) => {
        console.error(e);
      });
  }

  viewDrawer() {
    this.classList.toggle('close-drawer');
    this.overlay.classList.toggle('show-overlay');
  }

  onChange(event) {
    this.updateQuantity(
      event.target.dataset.index,
      event.target.value,
      document.activeElement.getAttribute('name'),
    );
  }

  getSectionsToRender() {
    return [
      {
        id: 'cart-drawer',
        section: document.getElementById('cart-drawer').dataset.id,
        selector: '.js-contents',
      },
      {
        id: 'cart-icon-bubble',
        section: 'cart-icon-bubble',
        selector: '.shopify-section',
      },
      {
        id: 'cart-live-region-text',
        section: 'cart-live-region-text',
        selector: '.shopify-section',
      },
    ];
  }

  renderContents(parsedState) {
    this.parsedId = parsedState.product_id;
    this.getProductRecommendation(parsedState.product_id);

    this.classList.toggle('is-empty', parsedState.item_count === 0);
    if (this.cartFooter)
      this.cartFooter.classList.toggle(
        'is-empty',
        parsedState.item_count === 0,
      );

    this.getSectionsToRender().forEach((section) => {
      const elementToReplace =
        document.getElementById(section.id).querySelector(section.selector) ||
        document.getElementById(section.id);

      elementToReplace.innerHTML = this.getSectionInnerHTML(
        parsedState.sections[section.section],
        section.selector,
      );
    });

    this.updateLiveRegions(1, parsedState.item_count);
    const lineItem = document.getElementById(`CartItem-1`);
    if (lineItem && lineItem.querySelector(`[name="${name}"]`))
      lineItem.querySelector(`[name="${name}"]`).focus();
    this.disableLoading();
  }

  updateQuantity(line, quantity, name) {
    this.enableLoading(line);

    const body = JSON.stringify({
      line,
      quantity,
      sections: this.getSectionsToRender().map((section) => section.section),
      sections_url: window.location.pathname,
    });

    fetch(`${routes.cart_change_url}`, { ...fetchConfig(), ...{ body } })
      .then((response) => {
        return response.text();
      })
      .then((state) => {
        const parsedState = JSON.parse(state);
        this.parsedId = parsedState.product_id;
        this.classList.toggle('is-empty', parsedState.item_count === 0);

        if (this.cartFooter)
          this.cartFooter.classList.toggle(
            'is-empty',
            parsedState.item_count === 0,
          );

        this.getProductRecommendation(parsedState.items[0].product_id);

        this.getSectionsToRender().forEach((section) => {
          const elementToReplace =
            document
              .getElementById(section.id)
              .querySelector(section.selector) ||
            document.getElementById(section.id);

          elementToReplace.innerHTML = this.getSectionInnerHTML(
            parsedState.sections[section.section],
            section.selector,
          );
        });

        this.updateLiveRegions(line, parsedState.item_count);
        const lineItem = document.getElementById(`CartItem-${line}`);
        if (lineItem && lineItem.querySelector(`[name="${name}"]`))
          lineItem.querySelector(`[name="${name}"]`).focus();
        this.disableLoading();
      })
      .catch(() => {
        this.querySelectorAll('.loading-overlay').forEach((overlay) =>
          overlay.classList.add('hidden'),
        );
        document.getElementById('cart-errors').textContent =
          window.cartStrings.error;
        this.disableLoading();
      });
  }

  updateLiveRegions(line, itemCount) {
    if (this.currentItemCount === itemCount) {
      document
        .getElementById(`Line-item-error-${line}`)
        .querySelector('.cart-item__error-text').innerHTML =
        window.cartStrings.quantityError.replace(
          '[quantity]',
          document.getElementById(`Quantity-${line}`).value,
        );
    }

    this.currentItemCount = itemCount;
    this.lineItemStatusElement.setAttribute('aria-hidden', true);

    const cartStatus = document.getElementById('cart-live-region-text');
    cartStatus.setAttribute('aria-hidden', false);

    setTimeout(() => {
      cartStatus.setAttribute('aria-hidden', true);
    }, 1000);
  }

  getSectionInnerHTML(html, selector) {
    return new DOMParser()
      .parseFromString(html, 'text/html')
      .querySelector(selector).innerHTML;
  }

  enableLoading(line) {
    document
      .getElementById('cart-drawer')
      .classList.add('cart__items--disabled');
    this.querySelectorAll(`#CartItem-${line} .loading-overlay`).forEach(
      (overlay) => overlay.classList.remove('hidden'),
    );
    document.activeElement.blur();
    this.lineItemStatusElement.setAttribute('aria-hidden', false);
  }

  disableLoading() {
    document
      .getElementById('cart-drawer')
      .classList.remove('cart__items--disabled');
  }
}

customElements.define('cart-items', CartItems);
