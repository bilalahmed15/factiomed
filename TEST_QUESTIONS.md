# Chatbot Test Questions

Use these questions to test different functionalities of the Functiomed chatbot.

## 📋 Informational Questions

1. **What are your opening hours?**
   - Tests: RAG response, information retrieval
   - Expected: Should provide opening hours from website content

2. **Tell me about physiotherapy**
   - Tests: RAG response, service information
   - Expected: Should explain physiotherapy services from website

3. **How can I get relief from back pain?**
   - Tests: RAG response with general health advice
   - Expected: Should provide helpful information while encouraging consultation

4. **What services do you offer?**
   - Tests: Service query detection
   - Expected: Should list available services

5. **Where are you located?**
   - Tests: RAG response, location information
   - Expected: Should provide address/location details

## 🏥 Doctor & Service Queries

6. **Which doctors are available in Physiotherapie?**
   - Tests: Doctor query with service filter
   - Expected: Should list doctors who provide physiotherapy services

7. **What doctors do you have?**
   - Tests: Doctor query detection
   - Expected: Should list all available doctors

8. **Who provides acupuncture services?**
   - Tests: Doctor query with service filter
   - Expected: Should list doctors who provide acupuncture

## 📅 Booking Requests

9. **I need to book an appointment**
   - Tests: Booking intent detection
   - Expected: Should start conversational booking flow

10. **I want to book an appointment with Dr. med. Christoph Lienhard**
    - Tests: Booking with specific doctor mentioned
    - Expected: Should start booking flow with doctor pre-selected

11. **Book appointment for general consultation**
    - Tests: Booking with service mentioned
    - Expected: Should start booking flow asking for doctor, then date/time

12. **I need to schedule a visit for tomorrow**
    - Tests: Booking with date preference
    - Expected: Should start booking flow and show available slots for tomorrow

## 🎯 Doctor Recommendations

13. **I've been having lower back pain for a few weeks**
    - Tests: Problem description detection
    - Expected: Should recommend relevant doctors/services

14. **I have a headache, who should I see?**
    - Tests: Recommendation system
    - Expected: Should recommend appropriate doctors based on symptoms

15. **My child needs physiotherapy, can you recommend someone?**
    - Tests: Recommendation with specific context
    - Expected: Should recommend pediatric physiotherapists

## 🚗 Parking Reservations

16. **I need to reserve parking**
    - Tests: Parking intent detection
    - Expected: Should open parking reservation flow

17. **Can I book a parking spot for next Tuesday?**
    - Tests: Parking with date
    - Expected: Should show parking slots for that date

## 🔍 Mixed/Complex Queries

18. **What is your phone number and when are you open?**
    - Tests: Multiple information requests
    - Expected: Should provide both pieces of information

19. **Do you accept insurance and what are your hours?**
    - Tests: Multiple queries in one message
    - Expected: Should answer both questions

20. **I'm looking for a doctor who speaks English**
    - Tests: Doctor query with language preference
    - Expected: Should filter or mention language capabilities

## 💬 Conversational Flow Tests

21. **Hello, I need help**
    - Tests: General greeting
    - Expected: Should respond friendly and ask how to help

22. **Can you help me with booking?**
    - Tests: Indirect booking request
    - Expected: Should detect booking intent and start flow

23. **What's the difference between physiotherapy and osteopathy?**
    - Tests: Comparative information query
    - Expected: Should explain differences from website content

## 🧪 Edge Cases

24. **Tell me about your team**
    - Tests: Team/doctor information
    - Expected: Should provide information about doctors/team

25. **How much does a consultation cost?**
    - Tests: Pricing information
    - Expected: Should provide pricing info if available, or suggest contacting

---

## Testing Checklist

- [ ] Informational queries work correctly
- [ ] Booking flow starts properly
- [ ] Doctor recommendations appear
- [ ] Parking reservations work
- [ ] Voice speaks all responses completely
- [ ] Pitch animation shows when speaking
- [ ] Quick replies appear when appropriate
- [ ] Calendar shows for date selection
- [ ] Booking flow doesn't repeat questions
- [ ] Session ID is maintained throughout booking



