package com.fitness.aiservice.service;

import com.fitness.aiservice.model.Activity;
import com.fitness.aiservice.model.Recommendation;
import com.fitness.aiservice.repository.RecommendationRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.mockito.Mockito.*;

class ActivityMessageListenerTest {

    private ActivityAIService aiService;
    private RecommendationRepository repository;
    private ActivityMessageListener listener;

    @BeforeEach
    void setUp() {
        aiService = mock(ActivityAIService.class);
        repository = mock(RecommendationRepository.class);
        listener = new ActivityMessageListener(aiService, repository);
    }

    @Test
    void skipsDuplicateActivityEvents() {
        Activity activity = new Activity();
        activity.setId("activity-1");
        when(repository.existsByActivityId("activity-1")).thenReturn(true);

        listener.processActivity(activity);

        verifyNoInteractions(aiService);
        verify(repository, never()).save(any());
    }

    @Test
    void generatesAndStoresRecommendationForNewActivity() {
        Activity activity = new Activity();
        activity.setId("activity-2");
        Recommendation recommendation = Recommendation.builder().activityId("activity-2").build();
        when(repository.existsByActivityId("activity-2")).thenReturn(false);
        when(aiService.generateRecommendation(activity)).thenReturn(recommendation);

        listener.processActivity(activity);

        verify(aiService).generateRecommendation(activity);
        verify(repository).save(recommendation);
    }
}
