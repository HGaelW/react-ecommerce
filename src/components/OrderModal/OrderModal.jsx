import React, { Component } from 'react';
import propTypes from 'prop-types';
import { connect } from 'react-redux';
import Notification from 'react-bulma-notification';
import './OrderModal.scss';
import {
  setOrderModal,
  fetchOrders,
  setOrderStep,
  submitOrder,
  submitOrderPayment,
  setSubmittingOrder
} from '../../actions/orderActions';
import { submitEmptyCart } from '../../actions/cartActions';
import { setCurrentUserField } from '../../actions/currentUserActions';
import { generateCartId } from '../../actions/cartActions';
import closeIcon from '../../assets/icons/icons-close-big-black.png';
import OrderDelivery from './OrderDelivery';
import OrderSummary from './OrderSummary';
import OrderPayment from './OrderPayment';
import OrderFinish from './OrderFinish';
import { generateStripToken } from '../../actions/orderActions';
import stripe from '../../utils/stripe';
const elements = stripe.elements();

const style = {
  base: {
    // base Strip input styles
    fontSize: '16px',
    color: '#32325d',
  }
};

export const card = elements.create('card', { style });

export class OrderModal extends Component {
  state = {
    validPeriod: '',
    validCreditCard: false,
  };


  componentDidMount() {
    const { cartId, _fetchOrders, _generateCartId } = this.props;

    card.addEventListener('change', e => {
      this.setState({
        validCreditCard: e.complete,
      });
    });

    if (cartId) {
      _fetchOrders(cartId);
      return;
    }
    _generateCartId();
  }

  _renderSteps = () => {
    const { orderStep } = this.props;
    switch (orderStep) {
      case 'Delivery':
        return <OrderDelivery />;
      case 'Confirmation':
        return <OrderSummary />;
      case 'Payment':
        return <OrderPayment card={card} />;
      case 'Finish':
        return <OrderFinish />;
      default:
        return <OrderDelivery />;
    }
  };

  _submitPrevious = () => {
    const { orderStep, _setOrderStep } = this.props;
    let nextStep = '';
    switch (orderStep) {
      case 'Confirmation':
        nextStep = 'Delivery';
        break;
      case 'Payment':
        nextStep = 'Confirmation';
        break;
      case 'Finish':
        nextStep = 'Payment';
        break;
      default:
        nextStep = 'Delivery';
        break;
    }
    _setOrderStep(nextStep);
  };

  _submitNext = async () => {
    const {
      orderStep,
      cartTotalAmount,
      cartId,
      user,
    } = this.props;
    let nextStep = '';
    switch (orderStep) {
      case 'Delivery':
        nextStep = 'Confirmation';
        break;
      case 'Confirmation':
        nextStep = 'Payment';
        break;
      case 'Payment':
        if (!this.state.validCreditCard) {
          nextStep = 'Payment';
          break;
        }
        const taxId = 1;
        const res = await this.props._submitOrder({
          cart_id: cartId,
          shipping_id: user.shipping_region_id,
          tax_id: taxId,
        });

        if (!res || !res.orderId) {
          nextStep = 'Payment';
          Notification.error('Could not connect to stripe. Please try again later', { duration: 4 })
          break;
        }
        const stripeResponse = await this.props._generateStripToken(card);
        if (!stripeResponse || !stripeResponse.token) {
          nextStep = 'Payment';
          Notification.error('Could not connect to stripe. Please try again later', { duration: 4 })
          break;
        }

        const paid = await this.props._submitOrderPayment({
          order_id: res.orderId,
          amount: cartTotalAmount,
          description: "Ecommnerce items' payment ",
          stripeToken: stripeResponse.token.id,
        });
        if (!paid || !paid.paid) {
          nextStep = 'Payment';
          Notification.error('Could not make the order. Please try again later', { duration: 4 })
          break;
        }
        await this.props._submitEmptyCart(cartId);
        nextStep = 'Finish';
        break;
      case 'Finish':
        this.props._setOrderModal('');
        break;
      default:
        nextStep = 'Delivery';
        break;
    }
    this.props._setOrderStep(nextStep);
    this.props._setSubmittingOrder(false);
  };

  render() {
    const {
      _setOrderModal,
      orderStep,
      submittingOrder,
      user,
    } = this.props;
    return (
      <div className="modal is-active modal-view">
        <div className="modal-background" />
        <div className="modal-card">
          <header className="modal-card-head is-column">
            <div className="is-flex content-space-between items-center is-fullwidth">
              <p className="modal-card-title">Checkout</p>
              <img
                className="modal-close-btn"
                src={closeIcon}
                alt="Close cicon"
                aria-label="close"
                onClick={_setOrderModal}
              />
            </div>
            <div className="progressbar-container">
              <ul className="progressbar">
                <li className={orderStep === 'Finish' ? 'active' : ''}>
                  Finish
                </li>
                <li className={orderStep === 'Payment' ? 'active' : ''}>
                  Payment
                </li>
                <li className={orderStep === 'Confirmation' ? 'active' : ''}>
                  Confirmation
                </li>
                <li className={orderStep === 'Delivery' ? 'active' : ''}>
                  Delivery
                </li>
              </ul>
            </div>
          </header>
          <section className="modal-card-body">{this._renderSteps()}</section>
          <footer className="modal-card-foot">
            <button
              disabled={orderStep === 'Delivery' || orderStep === 'Finish'}
              onClick={this._submitPrevious}
              className="previous-btn"
            >
              Back
            </button>
            <button
              onClick={this._submitNext}
              disabled={
                (orderStep === 'Payment' && !this.state.validCreditCard) ||
                (orderStep === 'Delivery' && (!user.country || !user.address_1 || !user.city || !user.region))
              }
              className={`next-btn ${submittingOrder ? 'loading' : ''}`}
            >
              {orderStep === 'Payment'
                ? 'Pay'
                : orderStep === 'Finish'
                ? 'Done'
                : 'Next'}
            </button>
          </footer>
        </div>
      </div>
    );
  }
}

OrderModal.propTypes = {
  orders: propTypes.array.isRequired,
  cartId: propTypes.any.isRequired,
  orderStep: propTypes.string.isRequired,
  orderSteps: propTypes.array.isRequired,
  submittingOrder: propTypes.bool.isRequired,
  user: propTypes.object.isRequired,
  updatingUser: propTypes.bool.isRequired,
  updatingUserAddress: propTypes.bool.isRequired,
  regions: propTypes.array.isRequired,
  region: propTypes.object.isRequired,
  allTax: propTypes.array.isRequired,
  cartTotalAmount: propTypes.oneOfType([
    propTypes.number.isRequired,
    propTypes.string.isRequired,
  ]),
  stripeToken: propTypes.object.isRequired,
};

export const mapStateToProps = ({
  currentUser: {
    user,
    updatingUser,
    updatingUserAddress,
  },
  order: {
    orders,
    orderStep,
    orderSteps,
    submittingOrder,
    allTax,
    stripeToken,
  },
  shipping: { regions, region },
  cart: {
    cartProductForm: { cart_id: cartId },
    cartTotalAmount,
  },
}) => ({
  orders,
  cartId,
  orderStep,
  orderSteps,
  submittingOrder,
  user,
  updatingUser,
  updatingUserAddress,
  regions,
  region,
  allTax,
  cartTotalAmount,
  stripeToken,
});

export const mapDispatchToProps = dispatch => ({
  _setOrderModal: () => dispatch(setOrderModal('')),
  _handleUserInput: ({ target: { value, name } }) =>
    dispatch(setCurrentUserField({ name, value })),
  _fetchOrders: payload => dispatch(fetchOrders(payload)),
  _setOrderStep: payload => dispatch(setOrderStep(payload)),
  _setSubmittingOrder: payload => dispatch(setSubmittingOrder(payload)),
  _submitOrder: payload => dispatch(submitOrder(payload)),
  _submitOrderPayment: payload => dispatch(submitOrderPayment(payload)),
  _generateCartId: payload => dispatch(generateCartId()),
  _submitEmptyCart: payload => dispatch(submitEmptyCart(payload)),
  _generateStripToken: payload => dispatch(generateStripToken(payload)),
});

export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(OrderModal);
