import '../test/setup';
import { reviewService } from './review.service';
import { reviewRepository } from '../repositories/review.repository';
import { Product } from '../models/Product.model';
import { createUser, createProduct, createOrder } from '../test/factories';
import { ApiError } from '../utils/ApiError';

const validInput = { productId: '', rating: 5, title: 'Great product', comment: 'Really happy with this purchase.' };

describe('reviewService — eligibility (spec 14.2)', () => {
  it('rejects a review from a user with no order for the product', async () => {
    const user = await createUser();
    const product = await createProduct();

    await expect(reviewService.create(user.id, { ...validInput, productId: product.id }, [])).rejects.toThrow(
      'delivered order'
    );
  });

  it('rejects a review when the user\'s order for the product has not been delivered yet', async () => {
    const user = await createUser();
    const product = await createProduct();
    await createOrder(user.id, product.id, { status: 'shipped' });

    await expect(reviewService.create(user.id, { ...validInput, productId: product.id }, [])).rejects.toThrow(
      'delivered order'
    );
  });

  it('allows a review once the order is delivered', async () => {
    const user = await createUser();
    const product = await createProduct();
    await createOrder(user.id, product.id, { status: 'delivered' });

    const review = await reviewService.create(user.id, { ...validInput, productId: product.id }, []);
    expect(review.isVerifiedPurchase).toBe(true);
    expect(review.status).toBe('pending');
  });

  it('rejects a duplicate review for the same product', async () => {
    const user = await createUser();
    const product = await createProduct();
    await createOrder(user.id, product.id);
    await reviewService.create(user.id, { ...validInput, productId: product.id }, []);

    await expect(reviewService.create(user.id, { ...validInput, productId: product.id }, [])).rejects.toThrow(
      'already reviewed'
    );
  });

  it('getEligibility reports canReview:false with a reason instead of throwing', async () => {
    const user = await createUser();
    const product = await createProduct();
    const result = await reviewService.getEligibility(user.id, product.id);
    expect(result.canReview).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it('getEligibility reports canReview:true once eligible', async () => {
    const user = await createUser();
    const product = await createProduct();
    await createOrder(user.id, product.id);
    const result = await reviewService.getEligibility(user.id, product.id);
    expect(result.canReview).toBe(true);
  });
});

describe('reviewService — rating validation', () => {
  it('rejects a rating outside 1-5 at the model layer', async () => {
    const user = await createUser();
    const product = await createProduct();
    await createOrder(user.id, product.id);

    await expect(
      reviewService.create(user.id, { ...validInput, productId: product.id, rating: 6 as never }, [])
    ).rejects.toThrow();
  });
});

describe('reviewService — moderation and rating aggregation (spec 14.3/14.5)', () => {
  it('does not count a pending review toward the product rating', async () => {
    const user = await createUser();
    const product = await createProduct();
    await createOrder(user.id, product.id);
    await reviewService.create(user.id, { ...validInput, productId: product.id, rating: 5 }, []);

    const updatedProduct = await Product.findById(product.id).exec();
    expect(updatedProduct?.ratings.count).toBe(0);
  });

  it('recomputes the product rating once a review is approved', async () => {
    const user = await createUser();
    const product = await createProduct();
    await createOrder(user.id, product.id);
    const review = await reviewService.create(user.id, { ...validInput, productId: product.id, rating: 4 }, []);

    await reviewService.moderate(review.id, 'approved');

    const updatedProduct = await Product.findById(product.id).exec();
    expect(updatedProduct?.ratings.average).toBe(4);
    expect(updatedProduct?.ratings.count).toBe(1);
  });

  it('averages multiple approved reviews correctly', async () => {
    const productOwner = await createUser();
    const product = await createProduct();

    const userA = await createUser();
    await createOrder(userA.id, product.id);
    const reviewA = await reviewService.create(userA.id, { ...validInput, productId: product.id, rating: 5 }, []);
    await reviewService.moderate(reviewA.id, 'approved');

    const userB = await createUser();
    await createOrder(userB.id, product.id);
    const reviewB = await reviewService.create(userB.id, { ...validInput, productId: product.id, rating: 3 }, []);
    await reviewService.moderate(reviewB.id, 'approved');

    const updatedProduct = await Product.findById(product.id).exec();
    expect(updatedProduct?.ratings.average).toBe(4);
    expect(updatedProduct?.ratings.count).toBe(2);
    void productOwner;
  });

  it('removes a review from the aggregate when moderated away from approved', async () => {
    const user = await createUser();
    const product = await createProduct();
    await createOrder(user.id, product.id);
    const review = await reviewService.create(user.id, { ...validInput, productId: product.id, rating: 5 }, []);
    await reviewService.moderate(review.id, 'approved');

    await reviewService.moderate(review.id, 'hidden');

    const updatedProduct = await Product.findById(product.id).exec();
    expect(updatedProduct?.ratings.count).toBe(0);
  });

  it('resets an edited review to pending and recomputes the aggregate', async () => {
    const user = await createUser();
    const product = await createProduct();
    await createOrder(user.id, product.id);
    const review = await reviewService.create(user.id, { ...validInput, productId: product.id, rating: 5 }, []);
    await reviewService.moderate(review.id, 'approved');

    const updated = await reviewService.update(user.id, review.id, { rating: 2 });
    expect(updated.status).toBe('pending');

    const updatedProduct = await Product.findById(product.id).exec();
    expect(updatedProduct?.ratings.count).toBe(0);
  });

  it('rejects editing another user\'s review', async () => {
    const owner = await createUser();
    const intruder = await createUser();
    const product = await createProduct();
    await createOrder(owner.id, product.id);
    const review = await reviewService.create(owner.id, { ...validInput, productId: product.id }, []);

    await expect(reviewService.update(intruder.id, review.id, { rating: 1 })).rejects.toThrow(
      'your own review'
    );
  });

  it('recomputes the aggregate on delete of an approved review', async () => {
    const user = await createUser();
    const product = await createProduct();
    await createOrder(user.id, product.id);
    const review = await reviewService.create(user.id, { ...validInput, productId: product.id, rating: 5 }, []);
    await reviewService.moderate(review.id, 'approved');

    await reviewService.remove(user.id, review.id);

    const updatedProduct = await Product.findById(product.id).exec();
    expect(updatedProduct?.ratings.count).toBe(0);
  });
});

describe('reviewService.listForProduct', () => {
  it('only returns approved reviews publicly', async () => {
    const product = await createProduct();

    const approvedUser = await createUser();
    await createOrder(approvedUser.id, product.id);
    const approved = await reviewService.create(approvedUser.id, { ...validInput, productId: product.id }, []);
    await reviewService.moderate(approved.id, 'approved');

    const pendingUser = await createUser();
    await createOrder(pendingUser.id, product.id);
    await reviewService.create(pendingUser.id, { ...validInput, productId: product.id }, []);

    const result = await reviewService.listForProduct(product.id, { sort: 'recent' }, 1, 10);
    expect(result.reviews).toHaveLength(1);
    expect(result.reviews[0].id).toBe(approved.id);
    expect(result.summary.count).toBe(1);
  });

  it('filters by exact star rating', async () => {
    const product = await createProduct();

    const userA = await createUser();
    await createOrder(userA.id, product.id);
    const reviewA = await reviewService.create(userA.id, { ...validInput, productId: product.id, rating: 5 }, []);
    await reviewService.moderate(reviewA.id, 'approved');

    const userB = await createUser();
    await createOrder(userB.id, product.id);
    const reviewB = await reviewService.create(userB.id, { ...validInput, productId: product.id, rating: 2 }, []);
    await reviewService.moderate(reviewB.id, 'approved');

    const result = await reviewService.listForProduct(product.id, { rating: 5, sort: 'recent' }, 1, 10);
    expect(result.reviews).toHaveLength(1);
    expect(result.reviews[0].rating).toBe(5);
  });

  it('flags hasVoted for the viewing user', async () => {
    const product = await createProduct();
    const author = await createUser();
    await createOrder(author.id, product.id);
    const review = await reviewService.create(author.id, { ...validInput, productId: product.id }, []);
    await reviewService.moderate(review.id, 'approved');

    const voter = await createUser();
    await reviewService.toggleHelpful(voter.id, review.id);

    const result = await reviewService.listForProduct(product.id, { sort: 'recent' }, 1, 10, voter.id);
    expect(result.reviews[0].hasVoted).toBe(true);

    const otherViewer = await createUser();
    const resultOther = await reviewService.listForProduct(product.id, { sort: 'recent' }, 1, 10, otherViewer.id);
    expect(resultOther.reviews[0].hasVoted).toBe(false);
  });
});

describe('reviewService.toggleHelpful', () => {
  async function approvedReview() {
    const product = await createProduct();
    const author = await createUser();
    await createOrder(author.id, product.id);
    const review = await reviewService.create(author.id, { ...validInput, productId: product.id }, []);
    await reviewService.moderate(review.id, 'approved');
    return { product, author, review };
  }

  it('toggles a helpful vote on and off', async () => {
    const { review } = await approvedReview();
    const voter = await createUser();

    let updated = await reviewService.toggleHelpful(voter.id, review.id);
    expect(updated.helpfulCount).toBe(1);

    updated = await reviewService.toggleHelpful(voter.id, review.id);
    expect(updated.helpfulCount).toBe(0);
  });

  it('rejects voting on your own review', async () => {
    const { author, review } = await approvedReview();
    await expect(reviewService.toggleHelpful(author.id, review.id)).rejects.toThrow('own review');
  });

  it('rejects voting on a non-approved review', async () => {
    const product = await createProduct();
    const author = await createUser();
    await createOrder(author.id, product.id);
    const review = await reviewService.create(author.id, { ...validInput, productId: product.id }, []);

    const voter = await createUser();
    await expect(reviewService.toggleHelpful(voter.id, review.id)).rejects.toThrow(ApiError);
  });
});

describe('reviewService — admin', () => {
  it('lists reviews across all statuses with filters', async () => {
    const product = await createProduct();
    const userA = await createUser();
    await createOrder(userA.id, product.id);
    await reviewService.create(userA.id, { ...validInput, productId: product.id }, []);

    const result = await reviewService.listForAdmin({ status: 'pending' }, 1, 10);
    expect(result.reviews).toHaveLength(1);
    expect(reviewRepository).toBeDefined();
  });

  it('admin can delete any review and the aggregate updates', async () => {
    const product = await createProduct();
    const user = await createUser();
    await createOrder(user.id, product.id);
    const review = await reviewService.create(user.id, { ...validInput, productId: product.id, rating: 5 }, []);
    await reviewService.moderate(review.id, 'approved');

    await reviewService.removeAdmin(review.id);

    const updatedProduct = await Product.findById(product.id).exec();
    expect(updatedProduct?.ratings.count).toBe(0);
  });
});
