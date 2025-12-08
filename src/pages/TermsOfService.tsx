import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const TermsOfService = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-sm p-8">
        <Button
          variant="ghost"
          onClick={() => navigate(-1)}
          className="mb-6"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>

        <h1 className="text-3xl font-bold mb-6">Terms of Service</h1>
        <p className="text-sm text-gray-600 mb-8">Last Updated: December 8, 2024</p>

        <div className="prose max-w-none space-y-6">
          <section>
            <h2 className="text-2xl font-semibold mb-4">1. Acceptance of Terms</h2>
            <p className="text-gray-700 leading-relaxed">
              By accessing and using Toss or Taste ("the Service"), you accept and agree to be bound by the terms and provision of this agreement.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">2. Use License</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              Permission is granted to temporarily use the Service for personal, non-commercial use only. This license does not include:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2">
              <li>Modifying or copying the materials</li>
              <li>Using the materials for any commercial purpose or public display</li>
              <li>Attempting to reverse engineer any software contained in the Service</li>
              <li>Removing any copyright or proprietary notations from the materials</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">3. Subscriptions and Payments</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              Some parts of the Service are billed on a subscription basis. You will be billed in advance on a recurring and periodic basis (monthly or annually).
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2">
              <li><strong>Auto-Renewal:</strong> Your subscription will automatically renew unless you cancel before the renewal date</li>
              <li><strong>Cancellation:</strong> You may cancel your subscription at any time through your device's subscription settings</li>
              <li><strong>Refunds:</strong> Refunds are handled according to Apple's App Store refund policy</li>
              <li><strong>Price Changes:</strong> We reserve the right to modify subscription fees with 30 days notice</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">4. Room Credits</h2>
            <p className="text-gray-700 leading-relaxed">
              Room credits are consumable in-app purchases that allow you to create rooms with real restaurant data. Credits are non-transferable and non-refundable except as required by law.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">5. User Conduct</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              You agree not to:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2">
              <li>Use the Service for any unlawful purpose</li>
              <li>Harass, abuse, or harm other users</li>
              <li>Impersonate any person or entity</li>
              <li>Interfere with or disrupt the Service</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">6. Disclaimer</h2>
            <p className="text-gray-700 leading-relaxed">
              The Service is provided "as is". We make no warranties, expressed or implied, and hereby disclaim all other warranties including, without limitation, implied warranties or conditions of merchantability, fitness for a particular purpose, or non-infringement of intellectual property.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">7. Limitations</h2>
            <p className="text-gray-700 leading-relaxed">
              In no event shall Toss or Taste or its suppliers be liable for any damages (including, without limitation, damages for loss of data or profit) arising out of the use or inability to use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">8. Changes to Terms</h2>
            <p className="text-gray-700 leading-relaxed">
              We reserve the right to revise these terms at any time. By continuing to use the Service after changes are posted, you agree to be bound by the revised terms.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">9. Contact Information</h2>
            <p className="text-gray-700 leading-relaxed">
              If you have any questions about these Terms of Service, please contact us through the app's feedback feature.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default TermsOfService;
