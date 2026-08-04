package com.fitness.activityservice.service;

import com.fitness.activityservice.ActivityRepository;
import com.fitness.activityservice.model.Activity;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.AmqpException;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class ActivityEventPublisherTest {

    private ActivityRepository repository;
    private RabbitTemplate rabbitTemplate;
    private ActivityEventPublisher publisher;

    @BeforeEach
    void setUp() {
        repository = mock(ActivityRepository.class);
        rabbitTemplate = mock(RabbitTemplate.class);
        publisher = new ActivityEventPublisher(repository, rabbitTemplate);
        ReflectionTestUtils.setField(publisher, "exchange", "fitness.exchange");
        ReflectionTestUtils.setField(publisher, "routingKey", "activity.tracking");
    }

    @Test
    void marksEventPublishedAfterSuccessfulSend() {
        Activity activity = Activity.builder().id("activity-1").build();

        publisher.publish(activity);

        assertTrue(activity.isEventPublished());
        assertNotNull(activity.getEventPublishedAt());
        verify(repository).save(activity);
    }

    @Test
    void leavesEventPendingWhenBrokerIsUnavailable() {
        Activity activity = Activity.builder().id("activity-2").build();
        doThrow(new AmqpException("broker unavailable"))
                .when(rabbitTemplate).convertAndSend(anyString(), anyString(), eq(activity));

        publisher.publish(activity);

        assertFalse(activity.isEventPublished());
        assertEquals(1, activity.getPublishAttempts());
        verify(repository).save(activity);
    }
}
