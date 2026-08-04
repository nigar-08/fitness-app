package com.fitness.activityservice.service;

import com.fitness.activityservice.ActivityRepository;
import com.fitness.activityservice.dto.ActivityRequest;
import com.fitness.activityservice.exception.InvalidUserException;
import com.fitness.activityservice.model.Activity;
import com.fitness.activityservice.model.ActivityType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class ActivityServiceTest {

    private ActivityRepository repository;
    private UserValidationService userValidationService;
    private ActivityService service;

    @BeforeEach
    void setUp() {
        repository = mock(ActivityRepository.class);
        userValidationService = mock(UserValidationService.class);
        service = new ActivityService(repository, userValidationService);
    }

    @Test
    void rejectsUnknownUserBeforeSaving() {
        ActivityRequest request = request();
        when(userValidationService.validateUser("user-1")).thenReturn(false);

        assertThrows(InvalidUserException.class, () -> service.trackActivity(request));

        verifyNoInteractions(repository);
    }

    @Test
    void savesValidActivityAsPendingOutboxEvent() {
        ActivityRequest request = request();
        when(userValidationService.validateUser("user-1")).thenReturn(true);
        when(repository.save(any(Activity.class))).thenAnswer(invocation -> {
            Activity activity = invocation.getArgument(0);
            activity.setId("activity-1");
            return activity;
        });

        var response = service.trackActivity(request);

        assertEquals("activity-1", response.getId());
        verify(repository).save(argThat(activity -> !activity.isEventPublished()));
    }

    private ActivityRequest request() {
        ActivityRequest request = new ActivityRequest();
        request.setUserId("user-1");
        request.setType(ActivityType.RUNNING);
        request.setDuration(30);
        request.setCaloriesBurned(250);
        request.setStartTime(LocalDateTime.now());
        return request;
    }
}
